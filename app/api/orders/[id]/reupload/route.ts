import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { db } from "@/lib/supabase";
import { logDecision } from "@/lib/log";
import { IMAGE_TYPES } from "@/lib/orders";
import { validateFiles, type UploadManifest } from "@/lib/uploads";
import { verifyUploads } from "@/lib/verify-uploads";
import { runFirstRead } from "@/lib/first-read";
import { hasAccess, privateHeaders, sameOrigin } from "@/lib/order-access";

// The AI first read runs inside after() on PUT.
export const maxDuration = 300;

async function reuploadOrder(request: Request, id: string) {
  if (!sameOrigin(request) || !(await hasAccess(id))) return null;
  const { data } = await db.from("orders").select("status").eq("id", id).single();
  return data?.status === "needs_reupload" ? data : null;
}

// Start a re-upload: drop the rejected screenshots and sign upload slots for the new ones.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!(await reuploadOrder(request, id)))
    return Response.json({ error: "This order isn't waiting for new screenshots." }, { status: 409 });
  const body = await request.json().catch(() => null);
  const files = body?.files as UploadManifest[];
  const invalid = validateFiles(files);
  if (invalid) return Response.json({ error: invalid }, { status: 400 });

  const { data: old } = await db.from("screenshots").select("storage_path").eq("order_id", id);
  if (old?.length) {
    const { error } = await db.storage.from("screenshots").remove(old.map((s) => s.storage_path));
    if (error) return Response.json({ error: "Could not clear your old screenshots. Please retry." }, { status: 503 });
    await db.from("screenshots").delete().eq("order_id", id);
  }
  const rows = files.map((file, i) => ({
    id: randomUUID(),
    order_id: id,
    position: i + 1,
    storage_path: `${id}/${randomUUID()}.${IMAGE_TYPES[file.type]}`,
  }));
  const { error: rowsError } = await db.from("screenshots").insert(rows);
  if (rowsError) return Response.json({ error: "Could not start your upload. Please retry." }, { status: 503 });
  const uploads = [];
  for (const row of rows) {
    const { data, error } = await db.storage.from("screenshots").createSignedUploadUrl(row.storage_path);
    if (error || !data) return Response.json({ error: "Could not start your upload. Please retry." }, { status: 503 });
    uploads.push({ path: row.storage_path, token: data.token });
  }
  return Response.json({ uploads, storageUrl: process.env.SUPABASE_URL }, { headers: privateHeaders });
}

// Finish a re-upload: check the files are real images, then run the first read again.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!(await reuploadOrder(request, id)))
    return Response.json({ error: "This order isn't waiting for new screenshots." }, { status: 409 });
  if (!(await verifyUploads(id)))
    return Response.json(
      { error: "Some screenshots did not finish uploading or are not valid images. Please retry." },
      { status: 400 },
    );
  const { data } = await db
    .from("orders")
    .update({ status: "screening" })
    .eq("id", id)
    .eq("status", "needs_reupload")
    .select("id");
  if (data?.length) {
    await logDecision(id, "reupload", "screening", "Customer uploaded new screenshots; running the first read again");
    after(() => runFirstRead(id));
  }
  return Response.json({ ok: true }, { headers: privateHeaders });
}
