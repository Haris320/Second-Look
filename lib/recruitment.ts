import "server-only";
import { db } from "./supabase";
import { withTerac } from "./terac";
import { assertRecruitable, opportunityInput, assertLaunchable, assertOpportunityMatches, type Opportunity } from "./recruitment-policy";
import { logDecision } from "./log";

type Job = { order_id: string; state: string; opportunity_id: string | null; task_token: string };
async function saveJob(orderId: string, update: Record<string, unknown>) {
  const { error } = await db.from("recruitment_jobs").update({ ...update, updated_at: new Date().toISOString() }).eq("order_id", orderId);
  if (error) throw new Error("Could not save recruitment state");
}

export async function recruitOrder(orderId: string) {
  if (process.env.TERAC_RECRUITMENT_ENABLED !== "true") return { state: "disabled" };
  const projectId = process.env.TERAC_PROJECT_ID;
  const baseUrl = process.env.PUBLIC_BASE_URL;
  const cap = Number(process.env.TERAC_MAX_ORDER_COST_CENTS);
  if (!projectId || !baseUrl || !Number.isSafeInteger(cap) || cap <= 0) throw new Error("Recruitment configuration incomplete");
  const { data: order, error } = await db.from("orders").select("status,audience,review_target,whop_payment_id,paid_at,amount_cents,first_read_json").eq("id", orderId).single();
  const { data: shots, error: shotsError } = await db.from("screenshots").select("position").eq("order_id", orderId);
  if (error || shotsError || !order) throw new Error("Could not load recruitment order");
  assertRecruitable(order, (shots ?? []).map(s => s.position));
  // Atomic unique order claim. No automatic lease expiry: an unknown create outcome
  // must be reconciled, never retried as another paid opportunity.
  const { data, error: claimError } = await db.rpc("claim_recruitment", { p_order_id: orderId });
  if (claimError) throw new Error("Could not claim recruitment; check the migration");
  if (!data) return { state: "already_claimed" };
  const job = data as Job;
  let phase = job.state;
  try {
    return await withTerac(async call => {
      const input = opportunityInput(orderId, order.audience, projectId, baseUrl, job.task_token, order.review_target);
      let opportunity: Opportunity;
      if (!job.opportunity_id) {
        phase = "creating";
        opportunity = await call<Opportunity>("terac_create_opportunity", input);
        if (!opportunity.id) throw new Error("Terac returned no opportunity ID");
        job.opportunity_id = opportunity.id;
        await saveJob(orderId, { opportunity_id: opportunity.id, state: "preparing" });
      }
      opportunity = await call<Opportunity>("terac_get_opportunity", { opportunityId: job.opportunity_id });
      assertOpportunityMatches(opportunity, input);
      // A launch can succeed even when its response was lost. Reconcile the SAME ID.
      if (["active", "fulfilled", "completed"].includes(opportunity.status)) {
        await saveJob(orderId, { state: "active", last_error: null });
        return { state: "active", opportunityId: job.opportunity_id };
      }
      phase = "preparing";
      assertLaunchable(opportunity, Math.min(cap, order.review_target * 600), order.review_target);
      // Recheck the order immediately before the spend, not just at claim time.
      const { data: latest, error: latestError } = await db.from("orders").select("status,audience,review_target,whop_payment_id,paid_at,amount_cents,first_read_json").eq("id", orderId).single();
      if (latestError || !latest || (latest.audience !== order.audience || latest.review_target !== order.review_target)) throw new Error("Order changed during recruitment");
      assertRecruitable(latest, (shots ?? []).map(s => s.position));
      await saveJob(orderId, { state: "launching", quoted_cost_cents: opportunity.pricing!.total_cost_cents });
      phase = "launching";
      const launched = await call<Opportunity>("terac_launch_draft_opportunity", { opportunityId: job.opportunity_id });
      if (!["active", "fulfilled", "completed"].includes(launched.status)) throw new Error("Launch outcome requires reconciliation");
      await saveJob(orderId, { state: "active", last_error: null });
      await logDecision(orderId, "recruitment", "launched", `Requested ${order.review_target} reviewer(s) for ${order.audience} through Terac MCP; opportunity ${job.opportunity_id}`);
      return { state: "active", opportunityId: job.opportunity_id };
    });
  } catch (e) {
    // If creation failed with no ID, leave it blocked. If there IS an ID,
    // an authenticated retry re-fetches it before deciding whether to launch.
    const state = !job.opportunity_id ? "needs_attention" : "retryable";
    const reason = e instanceof Error ? e.message : "Recruitment failed";
    await saveJob(orderId, { state, last_error: `${phase}: ${reason}` });
    await logDecision(orderId, "recruitment", state, `${phase}: ${reason}`);
    throw e;
  }
}
