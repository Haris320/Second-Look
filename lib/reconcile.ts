import "server-only";
import { db } from "./supabase";
import { withTerac } from "./terac";
import { recruitOrder } from "./recruitment";
import { assertOpportunityMatches, opportunityInput } from "./recruitment-policy";
import { processFeedback, processFeedbackEvent } from "./feedback-quality";
import { FEEDBACK_POLICY_VERSION } from "./feedback-policy";
import { deliverReportIfComplete, deleteScreenshots } from "./report";
import { logDecision } from "./log";
import { publishInsightsIfDue } from "./marketing";

// Safety net for every stall path, called every few minutes by a laptop loop or external pinger
// (POST /api/agent/reconcile, Bearer CRON_SECRET). Terac webhooks are the fast path; this is the
// path that always works. It never launches a new opportunity except through recruitOrder's normal
// flow for a paid order, never approves or rejects outside processFeedback's checks, and never moves money.

const MINUTE = 60_000;
const STALE_RECRUITMENT_MS = 10 * MINUTE;
const RETRY_RECRUITMENT_MS = 15 * MINUTE;
const LATE_DRAFT_WAIT_MS = 6 * MINUTE; // longest Terac create seen today was under five minutes
const UNRECRUITED_GRACE_MS = 2 * MINUTE; // first read's after() may still be running
const UNPROCESSED_EVENT_GRACE_MS = 2 * MINUTE; // the webhook's own after() may still be running
const LOW_CREDITS_DOLLARS = 18; // one three-reviewer order

type Attention = { orderId: string | null; step: string; choice: string; reason: string };
type Submission = { id: string; status: string; participant_id?: string };
type Summary = {
  recruited: unknown[]; feedback: unknown[]; events: unknown[]; reports: unknown[]; freed: string[]; deleted: string[];
  attention: Attention[]; errors: string[]; balanceDollars: number | null; marketing: string | null; ms: number;
};

function message(e: unknown) { return (e instanceof Error ? e.message : String(e)).slice(0, 200); }

// A create that timed out may still have produced a draft. Find it by this order's private task URL and adopt
// it (recruitOrder then launches it), or, when Terac has nothing for this order, clear the job and recruit again.
async function recoverLostCreate(orderId: string, taskToken: string) {
  const projectId = process.env.TERAC_PROJECT_ID;
  const baseUrl = process.env.PUBLIC_BASE_URL;
  if (!projectId || !baseUrl) throw new Error("Recruitment configuration incomplete");
  const { data: order, error } = await db.from("orders").select("status,audience,review_target").eq("id", orderId).single();
  if (error || !order || order.status !== "paid") throw new Error("Order is no longer waiting for recruitment");
  const input = opportunityInput(orderId, order.audience, projectId, baseUrl, taskToken, order.review_target);
  const since = Date.now() - 24 * 3600_000;
  const late = await withTerac(async call => {
    // The list omits internal_title, so read each recent draft/active opportunity and match on the full record.
    const page = await call<unknown>("terac_list_opportunities", { projectId, limit: 50 });
    const items = listItems<{ id?: string; status?: string; created_at?: string }>(page)
      .filter(item => typeof item?.id === "string" && ["draft", "active"].includes(item.status ?? "") && Date.parse(item.created_at ?? "") > since)
      .sort((a, b) => Date.parse(b.created_at ?? "") - Date.parse(a.created_at ?? ""))
      .slice(0, 12);
    for (const item of items) {
      const candidate = await call<Record<string, unknown>>("terac_get_opportunity", { opportunityId: item.id as string });
      if (candidate?.internal_title !== input.internal_title) continue;
      try { assertOpportunityMatches(candidate, input); return candidate as { id: string; status: string }; } catch { /* a different draft for this order, e.g. an older token */ }
    }
    return null;
  });
  if (late) {
    const { error: linkError } = await db.from("recruitment_jobs").update({ opportunity_id: late.id, state: "retryable", last_error: null, updated_at: new Date().toISOString() })
      .eq("order_id", orderId).eq("state", "needs_attention").is("opportunity_id", null);
    if (linkError) throw new Error("Could not adopt the late draft");
    await logDecision(orderId, "recruitment", "reconciled", `Create had timed out but Terac has ${late.status} opportunity ${late.id} for this order; adopted it instead of creating another`);
  } else {
    const { error: resetError } = await db.from("recruitment_jobs").delete().eq("order_id", orderId).eq("state", "needs_attention").is("opportunity_id", null);
    if (resetError) throw new Error("Could not reset the blocked recruitment job");
    await logDecision(orderId, "recruitment", "reset", "Create had timed out and Terac has no opportunity for this order; recruiting again from scratch");
  }
  return recruitOrder(orderId);
}
function listItems<T>(page: unknown): T[] {
  if (Array.isArray(page)) return page as T[];
  const found = Object.values((page ?? {}) as Record<string, unknown>).find(Array.isArray);
  return (found ?? []) as T[];
}

export async function reconcile(): Promise<Summary> {
  const started = Date.now();
  const s: Summary = { recruited: [], feedback: [], events: [], reports: [], freed: [], deleted: [], attention: [], errors: [], balanceDollars: null, marketing: null, ms: 0 };

  // Attention rows are logged at most once an hour per order/step/choice so a short loop can't flood the log.
  async function flag(a: Attention) {
    s.attention.push(a);
    let q = db.from("decisions").select("created_at").eq("step", a.step).eq("choice", a.choice).order("created_at", { ascending: false }).limit(1);
    q = a.orderId ? q.eq("order_id", a.orderId) : q.is("order_id", null);
    const { data } = await q;
    const last = data?.[0]?.created_at ? Date.parse(data[0].created_at) : 0;
    if (Date.now() - last > 60 * MINUTE) await logDecision(a.orderId, a.step, a.choice, a.reason.slice(0, 300));
  }

  const { data: orders, error: ordersError } = await db.from("orders").select("id,status,review_target,reviews_done,created_at,paid_at").in("status", ["paid", "in_review", "done"]).order("created_at");
  if (ordersError || !orders) throw new Error("Could not load orders");
  const { data: jobs } = await db.from("recruitment_jobs").select("order_id,state,opportunity_id,updated_at,last_error,task_token");
  const jobByOrder = new Map((jobs ?? []).map(j => [j.order_id, j]));

  // 1. Recruitment: paid orders that never got a job, retryable jobs, and stuck or blocked jobs.
  for (const o of orders.filter(o => o.status === "paid")) {
    const job = jobByOrder.get(o.id);
    const since = Date.now() - Date.parse(o.paid_at ?? o.created_at);
    try {
      if (!job) {
        if (since > UNRECRUITED_GRACE_MS) s.recruited.push({ orderId: o.id, ...(await recruitOrder(o.id)) });
      } else if (job.state === "retryable") {
        // Retry at most every 15 minutes: each failed attempt (for example, no credits) logs a decision row.
        if (Date.now() - Date.parse(job.updated_at) > RETRY_RECRUITMENT_MS) s.recruited.push({ orderId: o.id, ...(await recruitOrder(o.id)) });
        else await flag({ orderId: o.id, step: "recruitment", choice: "waiting_retry", reason: `Recruitment will be retried: ${job.last_error ?? "unknown error"}` });
      } else if (["creating", "preparing", "launching"].includes(job.state) && Date.now() - Date.parse(job.updated_at) > STALE_RECRUITMENT_MS) {
        await flag({ orderId: o.id, step: "recruitment", choice: "stuck", reason: `Recruitment job has been '${job.state}' since ${job.updated_at}${job.opportunity_id ? ` (opportunity ${job.opportunity_id})` : " with no opportunity ID"}; inspect Terac drafts named second-look:${o.id} before retrying` });
      } else if (job.state === "needs_attention" && !job.opportunity_id) {
        // The create call timed out (Terac creates have taken up to five minutes). Wait, then either adopt the late
        // draft Terac made for this order or, if there is none, recruit again from scratch. Never both.
        if (Date.now() - Date.parse(job.updated_at) > LATE_DRAFT_WAIT_MS) s.recruited.push({ orderId: o.id, ...(await recoverLostCreate(o.id, job.task_token)) });
      } else if (job.state === "needs_attention") {
        await flag({ orderId: o.id, step: "recruitment", choice: "blocked", reason: `Recruitment needs a human: ${job.last_error ?? "unknown error"}` });
      }
    } catch (e) {
      s.errors.push(`recruit ${o.id}: ${message(e)}`);
    }
  }

  // 2. Sync with Terac for every order that is being reviewed: find finished work, free abandoned slots, notice dead opportunities.
  const live = orders.filter(o => ["paid", "in_review"].includes(o.status) && jobByOrder.get(o.id)?.state === "active" && jobByOrder.get(o.id)?.opportunity_id).slice(0, 20);
  const { data: reviews } = live.length
    ? await db.from("reviews").select("id,order_id,terac_submission_id,status,submitted_at,created_at").in("order_id", live.map(o => o.id))
    : { data: [] as { id: string; order_id: string; terac_submission_id: string; status: string; submitted_at: string | null; created_at: string }[] };
  const { data: fjobs } = await db.from("feedback_quality_jobs").select("submission_id,state,lease_until,last_error,policy_version,decision");
  const fjobBySubmission = new Map((fjobs ?? []).map(j => [j.submission_id, j]));
  const candidates = new Set<string>();
  if (live.length) {
    try {
      await withTerac(async call => {
        for (const o of live) {
          const opportunityId = jobByOrder.get(o.id)!.opportunity_id as string;
          const mine = (reviews ?? []).filter(r => r.order_id === o.id);
          try {
            const opp = await call<{ status: string; submission_stats?: Record<string, number> }>("terac_get_opportunity", { opportunityId });
            if (!["active", "fulfilled", "completed"].includes(opp.status)) {
              await flag({ orderId: o.id, step: "recruitment", choice: `opportunity_${opp.status}`, reason: `Terac opportunity ${opportunityId} is ${opp.status} while the order is ${o.status} with ${o.reviews_done} of ${o.review_target} reviews` });
            }
            const awaiting = listItems<Submission>(await call("terac_get_submissions", { opportunityId, status: "awaiting_review", limit: 100 }));
            for (const sub of awaiting) {
              const local = mine.find(r => r.terac_submission_id === sub.id);
              if (!local) await flag({ orderId: o.id, step: "review", choice: "unassigned_submission", reason: `Terac submission ${sub.id} is awaiting review but was never assigned on our side; nothing to grade, so it stays unpaid until a human looks` });
              else if (!local.submitted_at) await flag({ orderId: o.id, step: "review", choice: "missing_answers", reason: `Terac submission ${sub.id} is awaiting review but no answers were saved on our side; left pending for a human` });
              else if (local.status === "pending") candidates.add(sub.id);
            }
          } catch (e) {
            s.errors.push(`terac ${o.id}: ${message(e)}`);
          }
          // Terac's list can lag behind individual submissions, so check each pending local review directly.
          for (const r of mine.filter(r => r.status === "pending" && !candidates.has(r.terac_submission_id))) {
            try {
              const remote = await call<Submission>("terac_get_submission", { submissionId: r.terac_submission_id });
              if (r.submitted_at) {
                if (["awaiting_review", "approved", "rejected"].includes(remote.status)) candidates.add(r.terac_submission_id);
              } else if (["abandoned", "rejected", "screened_out"].includes(remote.status) && Date.now() - Date.parse(r.created_at) > 30 * MINUTE) {
                // The reviewer left without submitting. Free the slot so the next Terac reviewer can take it.
                const { data: freed } = await db.from("reviews").update({ status: "rejected", terac_status: remote.status, terac_status_at: new Date().toISOString() })
                  .eq("id", r.id).eq("status", "pending").is("submitted_at", null).select("id");
                if (freed?.length) {
                  s.freed.push(r.terac_submission_id);
                  await logDecision(o.id, "review", "slot_freed", `Terac submission ${r.terac_submission_id} is ${remote.status} without answers; freed its slot for the next reviewer`);
                }
              }
            } catch (e) {
              s.errors.push(`submission ${r.terac_submission_id}: ${message(e)}`);
            }
          }
        }
      });
    } catch (e) {
      s.errors.push(`terac: ${message(e)}`);
    }
  }

  // 3. Grade finished work that the webhook didn't (or couldn't) process, and retry interrupted checks.
  for (const id of candidates) {
    const fj = fjobBySubmission.get(id);
    if (fj?.state === "done") continue;
    // A hold decided under an older policy version is re-graded under the current one (the saved assessment
    // stays for audit). Holds made under the current policy, and all other states, are only surfaced.
    if (fj?.state === "needs_attention" && fj.policy_version && fj.policy_version !== FEEDBACK_POLICY_VERSION && fj.decision?.outcome === "needs_attention") {
      const orderId = (reviews ?? []).find(r => r.terac_submission_id === id)?.order_id ?? null;
      const { data: reopened } = await db.from("feedback_quality_jobs").update({ state: "retry", decision: null, input_hash: null, last_error: null, updated_at: new Date().toISOString() })
        .eq("submission_id", id).eq("state", "needs_attention").eq("policy_version", fj.policy_version).select("submission_id");
      if (reopened?.length) {
        await logDecision(orderId, "review_quality", "reopened", `Hold was decided under ${fj.policy_version}; grading again under ${FEEDBACK_POLICY_VERSION}`);
        try { s.feedback.push({ submissionId: id, ...(await processFeedback(id)) }); }
        catch (e) { s.errors.push(`feedback ${id}: ${message(e)}`); }
      }
      continue;
    }
    if (fj?.state === "needs_attention") {
      const orderId = (reviews ?? []).find(r => r.terac_submission_id === id)?.order_id ?? null;
      await flag({ orderId, step: "review_quality", choice: "still_held", reason: `Submission ${id} is held for a human: ${fj.last_error ?? "see feedback_quality_jobs"}` });
      continue;
    }
    if (fj?.state === "checking" && fj.lease_until && Date.parse(fj.lease_until) > Date.now()) continue;
    try { s.feedback.push({ submissionId: id, ...(await processFeedback(id)) }); }
    catch (e) { s.errors.push(`feedback ${id}: ${message(e)}`); }
  }

  // 4. Webhook events whose processing failed or was cut short.
  const { data: events } = await db.from("terac_webhook_events").select("event_id,payload").is("processed_at", null)
    .lt("received_at", new Date(Date.now() - UNPROCESSED_EVENT_GRACE_MS).toISOString()).order("occurred_at").limit(20);
  for (const e of events ?? []) {
    try { await processFeedbackEvent(e.payload as { event_id: string; resource_id?: string; to?: string }); s.events.push(e.event_id); }
    catch (err) { s.errors.push(`event ${e.event_id}: ${message(err)}`); }
  }

  // 5. Reports that have all their approved reviews but weren't delivered (re-read counts; step 3 may have changed them).
  const { data: fresh } = await db.from("orders").select("id,review_target,reviews_done").in("status", ["paid", "in_review"]);
  for (const o of (fresh ?? []).filter(o => o.reviews_done >= o.review_target)) {
    s.reports.push({ orderId: o.id, ...(await deliverReportIfComplete(o.id)) });
  }

  // 6. Privacy: delivered orders that still have screenshots.
  const done = orders.filter(o => o.status === "done").map(o => o.id);
  if (done.length) {
    const { data: leftover } = await db.from("screenshots").select("order_id").in("order_id", done);
    for (const orderId of new Set((leftover ?? []).map(l => l.order_id))) {
      await deleteScreenshots(orderId);
      s.deleted.push(orderId);
    }
  }

  // 7. Credits: alert (never pause sales) when the balance can't cover one more full order.
  try {
    const ctx = await withTerac(call => call<{ balanceDollars?: number }>("terac_get_context", {}));
    if (typeof ctx.balanceDollars === "number") {
      s.balanceDollars = ctx.balanceDollars;
      if (ctx.balanceDollars < LOW_CREDITS_DOLLARS) await flag({ orderId: null, step: "credits", choice: "low", reason: `Terac balance is $${ctx.balanceDollars.toFixed(2)}, below one three-reviewer order ($18); top up at terac.com` });
    }
  } catch (e) {
    s.errors.push(`credits: ${message(e)}`);
  }

  // 8. Marketing: republish the public /insights post from aggregate review patterns when enough new reviews are in.
  try {
    const m = await publishInsightsIfDue();
    s.marketing = `${m.state}${m.detail ? `: ${m.detail}` : ""}`;
  } catch (e) {
    s.errors.push(`marketing: ${message(e)}`);
  }

  s.ms = Date.now() - started;
  return s;
}
