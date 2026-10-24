import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/supabase";
import { deliverReportIfComplete } from "@/lib/report";

export const maxDuration = 300;

// Recovery/backfill: delivers every order that already has all its approved reviews but no report yet.
// Approvals trigger delivery on their own; call this if one failed or after a deploy.
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: orders, error } = await db.from("orders").select("id,review_target,reviews_done").in("status", ["paid", "in_review"]);
  if (error) return Response.json({ error: "Could not load orders" }, { status: 503 });
  const ready = (orders ?? []).filter(o => o.reviews_done >= o.review_target);
  const results = [];
  for (const order of ready) results.push({ orderId: order.id, ...(await deliverReportIfComplete(order.id)) });
  return Response.json({ checked: orders?.length ?? 0, results });
}
