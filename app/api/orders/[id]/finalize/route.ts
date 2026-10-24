import { after } from "next/server";
import { db } from "@/lib/supabase";
import { logDecision } from "@/lib/log";
import { createCheckout } from "@/lib/whop";
import { MIN_SCREENSHOTS, notifyOrderPaid } from "@/lib/orders";
import type { Tier } from "@/lib/tiers";

// After the browser finishes uploading: record the screenshots, then
// Flow A (pending_payment) → return the Whop checkout URL; Flow B (awaiting_upload, already paid) → mark paid.
export async function POST(_request: Request, ctx: RouteContext<"/api/orders/[id]/finalize">) {
  const { id } = await ctx.params;
  const { data: order } = await db.from("orders").select("status, tier").eq("id", id).maybeSingle();
  if (!order || !["pending_payment", "awaiting_upload"].includes(order.status)) {
    return Response.json({ error: "This order can't be finalized." }, { status: 409 });
  }

  const { data: files } = await db.storage.from("screenshots").list(id, { sortBy: { column: "name", order: "asc" } });
  const uploaded = (files ?? []).filter((file) => file.id);
  if (uploaded.length < MIN_SCREENSHOTS) {
    return Response.json({ error: `We received ${uploaded.length} screenshots; please upload at least ${MIN_SCREENSHOTS}.` }, { status: 400 });
  }

  // Re-finalizing (e.g. a retry) replaces the rows instead of duplicating them.
  await db.from("screenshots").delete().eq("order_id", id);
  await db.from("screenshots").insert(
    uploaded.map((file) => ({ order_id: id, storage_path: `${id}/${file.name}`, position: parseInt(file.name, 10) })),
  );

  if (order.status === "awaiting_upload") {
    await db.from("orders").update({ status: "paid" }).eq("id", id).eq("status", "awaiting_upload");
    await logDecision(id, "order", "paid", `Marketplace buyer uploaded ${uploaded.length} screenshots`);
    after(() => notifyOrderPaid(id));
    return Response.json({ next: `/order/${id}` });
  }

  try {
    const { checkoutId, purchaseUrl } = await createCheckout(id, order.tier as Tier);
    await db.from("orders").update({ whop_checkout_id: checkoutId }).eq("id", id);
    return Response.json({ next: purchaseUrl });
  } catch (err) {
    console.error("createCheckout failed", err);
    const paused = err instanceof Error && err.message === "Sales are paused";
    return Response.json(
      { error: paused ? "We're at capacity right now. Please check back soon." : "Couldn't start checkout. Try again." },
      { status: paused ? 503 : 502 },
    );
  }
}
