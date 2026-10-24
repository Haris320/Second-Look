import { db } from "@/lib/supabase";
import { AUDIENCES } from "@/lib/tiers";
import { IMAGE_TYPES, MAX_SCREENSHOTS, MIN_SCREENSHOTS } from "@/lib/orders";

// Signed upload URLs so the browser uploads straight into the private bucket, no public access needed.
// Body: { types: ["image/png", ...] } in display order, plus { audience } for Flow B orders.
export async function POST(request: Request, ctx: RouteContext<"/api/orders/[id]/uploads">) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const types: string[] = Array.isArray(body.types) ? body.types : [];

  if (types.length < MIN_SCREENSHOTS || types.length > MAX_SCREENSHOTS) {
    return Response.json({ error: `Upload ${MIN_SCREENSHOTS} to ${MAX_SCREENSHOTS} screenshots.` }, { status: 400 });
  }
  if (types.some((type) => !(type in IMAGE_TYPES))) {
    return Response.json({ error: "Screenshots must be PNG, JPEG, WebP or HEIC." }, { status: 400 });
  }

  const { data: order } = await db.from("orders").select("status").eq("id", id).maybeSingle();
  if (!order || !["pending_payment", "awaiting_upload"].includes(order.status)) {
    return Response.json({ error: "This order isn't accepting uploads." }, { status: 409 });
  }
  if (order.status === "awaiting_upload") {
    if (!(body.audience in AUDIENCES)) return Response.json({ error: "Pick who should review you." }, { status: 400 });
    await db.from("orders").update({ audience: body.audience }).eq("id", id);
  }

  const uploads = [];
  for (const [index, type] of types.entries()) {
    const path = `${id}/${index + 1}.${IMAGE_TYPES[type]}`;
    const { data, error } = await db.storage.from("screenshots").createSignedUploadUrl(path, { upsert: true });
    if (error) return Response.json({ error: "Couldn't prepare uploads. Try again." }, { status: 500 });
    uploads.push({ path: data.path, token: data.token });
  }
  return Response.json({ uploads });
}
