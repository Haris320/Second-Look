import { timingSafeEqual } from "node:crypto";
import { recruitOrder } from "@/lib/recruitment";

export const maxDuration = 300;

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body || typeof body.orderId !== "string" || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(body.orderId)) return Response.json({ error: "Invalid order ID" }, { status: 400 });
  try { return Response.json(await recruitOrder(body.orderId)); }
  catch { return Response.json({ error: "Recruitment could not complete; check decisions and recruitment_jobs" }, { status: 503 }); }
}
