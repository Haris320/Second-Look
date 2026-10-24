import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { reconcile } from "@/lib/reconcile";
import { claimHeartbeat, hasOpenWork, kickReconcile } from "@/lib/reconcile-kick";
import { logDecision } from "@/lib/log";

export const maxDuration = 300;

// Safety net for stuck states, and the system's own clock.
//   ?async=1  (what webhooks, pages and the chain use): claim the heartbeat, answer at once, work in after(),
//             then schedule the next pass while any order is open.
//   default   (manual/debug, scripts/reconcile-loop.mjs): run inline and return the full summary.
// The daily Vercel cron (GET) is only a backstop.
function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return Boolean(secret) && supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

async function runPass(source: string) {
  const started = Date.now();
  try {
    const s = await reconcile();
    const moved = s.recruited.length + s.feedback.length + s.events.length + s.reports.length + s.freed.length + s.deleted.length;
    if (moved || s.errors.length) {
      await logDecision(null, "reconcile", "summary", `Pass (${source}) in ${Math.round(s.ms / 1000)}s: ${s.recruited.length} recruitment, ${s.feedback.length} review check(s), ${s.reports.length} report(s), ${s.events.length} event(s), ${s.freed.length} slot(s) freed, ${s.deleted.length} cleanup(s); ${s.errors.length} error(s)${s.errors.length ? `: ${s.errors.join(" | ")}` : ""}`.slice(0, 300));
    }
  } catch (e) {
    console.error("reconcile failed", e);
    await logDecision(null, "reconcile", "failed", `Pass (${source}) failed: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300));
  }
  // Keep the clock ticking while there is open work. Budget: this function may live 300 s in total.
  const elapsed = Date.now() - started;
  if (elapsed > 230_000 || !(await hasOpenWork().catch(() => true))) return;
  await new Promise(resolve => setTimeout(resolve, Math.max(15_000, 125_000 - elapsed)));
  await kickReconcile("chain");
}

async function handle(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const source = (url.searchParams.get("source") ?? "manual").slice(0, 40);
  if (url.searchParams.get("async") === "1" || request.method === "GET") {
    let claimed = false;
    try { claimed = await claimHeartbeat(); } catch (e) { return Response.json({ error: e instanceof Error ? e.message : "Heartbeat failed" }, { status: 503 }); }
    if (!claimed) return Response.json({ skipped: true, reason: "A pass started less than 100 s ago" }, { headers: { "Cache-Control": "no-store" } });
    after(() => runPass(source));
    return Response.json({ started: true, source }, { status: 202, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const summary = await reconcile();
    return Response.json(summary, { status: summary.errors.length ? 207 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("reconcile failed", e);
    return Response.json({ error: "Reconcile failed; see logs" }, { status: 503 });
  }
}

export const GET = handle;
export const POST = handle;
