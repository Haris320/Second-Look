import { randomUUID } from "node:crypto";
import { db } from "@/lib/supabase";
import { logDecision } from "@/lib/log";
import { validateFiles, type UploadManifest } from "@/lib/uploads";
import { TIERS, isTier, isAudience } from "@/lib/tiers";
import { grantAccess, sameOrigin, privateHeaders } from "@/lib/order-access";
import { issueOrderLink } from "@/lib/order-links";

export async function POST(request: Request) {
  if (!sameOrigin(request))
    return Response.json(
      { error: "Please submit from this website." },
      { status: 403 },
    );
  if (Number(request.headers.get("content-length")) > 20000)
    return Response.json({ error: "Request too large." }, { status: 413 });
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    return Response.json({ error: "Invalid request." }, { status: 400 });
  const { email, audience, tier, ownProfile, adult, files } = body;
  if (!isTier(tier)) return Response.json({ error: "Choose a review package." }, { status: 400 });
  if (!isAudience(audience))
    return Response.json(
      { error: "Choose who should review your profile." },
      { status: 400 },
    );
  const error = validateFiles(files);
  if (error) return Response.json({ error }, { status: 400 });
  if (
    typeof email !== "string" ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  )
    return Response.json(
      { error: "Enter a valid email address." },
      { status: 400 },
    );
  if (ownProfile !== true || adult !== true)
    return Response.json(
      { error: "Choose your review details and confirm both checkboxes." },
      { status: 400 },
    );
  const normalizedEmail = email.trim().toLowerCase();
  // Persistent per-email cap prevents accidental duplicate drafts across serverless instances.
  const { count, error: countError } = await db
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("email", normalizedEmail)
    .gte("created_at", new Date(Date.now() - 3600000).toISOString());
  if (countError)
    return Response.json(
      { error: "Uploads are temporarily unavailable. Please try again." },
      { status: 503 },
    );
  if ((count ?? 0) >= 5)
    return Response.json(
      {
        error:
          "You have created several orders recently. Please return to your existing order or try again in an hour.",
      },
      { status: 429 },
    );
  const id = randomUUID();
  const rows = (files as UploadManifest[]).map((file, position) => ({
    id: randomUUID(),
    order_id: id,
    position: position + 1,
    storage_path: `${id}/${randomUUID()}.${file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp"}`,
  }));
  try {
    const { error: orderError } = await db.from("orders").insert({
      id,
      email: normalizedEmail,
      audience,
      tier,
      review_target: TIERS[tier].reviews,
      status: "pending_payment",
    });
    if (orderError) throw orderError;
    const { error: rowsError } = await db.from("screenshots").insert(rows);
    if (rowsError) throw rowsError;
    const uploads = [];
    for (const row of rows) {
      const { data, error: signError } = await db.storage
        .from("screenshots")
        .createSignedUploadUrl(row.storage_path);
      if (signError || !data) throw signError;
      uploads.push({ path: row.storage_path, token: data.token });
    }
    await logDecision(
      id,
      "order",
      "created",
      `$${TIERS[tier].priceUsd} order with ${TIERS[tier].reviews} reviewer(s); awaiting payment`,
    );
    await grantAccess(id);
    await issueOrderLink(id);
    return Response.json(
      { orderId: id, uploads, storageUrl: process.env.SUPABASE_URL },
      { headers: privateHeaders },
    );
  } catch {
    await db.from("orders").delete().eq("id", id);
    return Response.json(
      { error: "We could not start your upload. Please try again." },
      { status: 503 },
    );
  }
}
