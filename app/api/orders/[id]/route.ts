import { db } from "@/lib/supabase";

// Status for /order/[id]. The order ID is an unguessable UUID, so it doubles as the customer's link.
export async function GET(_request: Request, ctx: RouteContext<"/api/orders/[id]">) {
  const { id } = await ctx.params;
  const { data } = await db
    .from("orders")
    .select("id, audience, tier, status, review_target, reviews_done, report_json, delivered_at")
    .eq("id", id)
    .maybeSingle();
  if (!data) return Response.json({ error: "Order not found." }, { status: 404 });
  return Response.json(data);
}
