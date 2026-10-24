import { timingSafeEqual } from "node:crypto";
import { reconcile } from "@/lib/reconcile";

export const maxDuration = 300;

// Safety net for stuck states. Call every few minutes from a laptop loop (scripts/reconcile-loop.mjs)
// or an external pinger; the daily Vercel cron is only a backstop. GET and POST both work so any pinger can call it.
function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return Boolean(secret) && supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

async function run(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const summary = await reconcile();
    return Response.json(summary, { status: summary.errors.length ? 207 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("reconcile failed", e);
    return Response.json({ error: "Reconcile failed; see logs" }, { status: 503 });
  }
}

export const GET = run;
export const POST = run;
