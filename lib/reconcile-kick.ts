import "server-only";
import { db } from "./supabase";

// The system has no minute-level cron (Vercel Hobby crons run daily), so it kicks its own reconcile pass from
// every inbound event: Whop and Terac webhooks, the reviewer page, customer order-page polls, the dashboard.
// A heartbeat row in `decisions` (step 'reconcile', choice 'heartbeat', updated in place) makes sure at most
// one pass starts per HEARTBEAT_MS across all function instances. While orders are open, each pass also
// schedules the next one, so quiet periods are covered too. Any event restarts a broken chain.

export const HEARTBEAT_MS = 100_000;

// Fire-and-forget request to our own reconcile route; the route answers immediately and works in after().
// Call this inside after() so the caller's response isn't delayed. Never throws.
export async function kickReconcile(source: string) {
  const base = process.env.PUBLIC_BASE_URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) return;
  try {
    const url = new URL("/api/agent/reconcile", base);
    url.searchParams.set("async", "1");
    url.searchParams.set("source", source);
    await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(8_000) });
  } catch (e) {
    console.error("reconcile kick failed", source, e instanceof Error ? e.message : e);
  }
}

// Atomically claims the heartbeat if the last pass started more than HEARTBEAT_MS ago. Exactly one caller wins.
export async function claimHeartbeat(): Promise<boolean> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - HEARTBEAT_MS).toISOString();
  const { data: existing, error } = await db.from("decisions").select("id,created_at").eq("step", "reconcile").eq("choice", "heartbeat").is("order_id", null).order("created_at", { ascending: false }).limit(1);
  if (error) throw new Error("Could not read the reconcile heartbeat");
  if (!existing?.length) {
    // First ever run: insert. A concurrent first run may also insert; the next claims pick the newest row and
    // the worst case is one duplicate pass, which reconcile's own leases make harmless.
    const { error: insertError } = await db.from("decisions").insert({ order_id: null, step: "reconcile", choice: "heartbeat", reason: "Last reconcile pass started at this row's time; updated in place, hidden on the dashboard" });
    if (insertError) throw new Error("Could not create the reconcile heartbeat");
    return true;
  }
  const { data: claimed, error: claimError } = await db.from("decisions").update({ created_at: now.toISOString() }).eq("id", existing[0].id).lt("created_at", cutoff).select("id");
  if (claimError) throw new Error("Could not claim the reconcile heartbeat");
  return Boolean(claimed?.length);
}

// Is there anything a future pass could still move? If not, the chain stops until the next event.
export async function hasOpenWork(): Promise<boolean> {
  const [{ count: orders }, { count: events }, { count: retries }] = await Promise.all([
    db.from("orders").select("id", { count: "exact", head: true }).in("status", ["paid", "in_review"]),
    db.from("terac_webhook_events").select("event_id", { count: "exact", head: true }).is("processed_at", null),
    db.from("feedback_quality_jobs").select("submission_id", { count: "exact", head: true }).eq("state", "retry"),
  ]);
  return (orders ?? 0) + (events ?? 0) + (retries ?? 0) > 0;
}
