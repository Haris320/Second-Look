import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { after } from "next/server";
import sharp from "sharp";
import { db } from "./supabase";
import { withTerac } from "./terac";
import { assessFeedback, FEEDBACK_MODEL } from "./feedback-assessment";
import { decideFeedback, FEEDBACK_POLICY_VERSION, type FeedbackDecision } from "./feedback-policy";
import { applyFeedbackDecision, assertSubmission, type Submission } from "./feedback-actions";
import { parseReviewAnswers } from "./reviewer-access";
import { logDecision } from "./log";
import { deliverReportIfComplete } from "./report";

type QualityJob = { state: string; attempts: number; decision: FeedbackDecision | null; input_hash: string | null };
export async function processFeedback(submissionId: string) {
  if (process.env.FEEDBACK_REVIEW_ENABLED !== "true") throw new Error("Feedback automation is not enabled");
  const { data: review, error } = await db.from("reviews").select("id,order_id,terac_participant_id,answers_json,duration_s,submitted_at,status").eq("terac_submission_id", submissionId).maybeSingle();
  if (error) throw new Error("Could not load feedback");
  // Organization-wide webhooks can describe studies not owned by this app.
  if (!review) return { state: "unassigned" };
  const token = randomUUID();
  const { data, error: claimError } = await db.rpc("claim_feedback_quality", { p_submission: submissionId, p_token: token });
  if (claimError) throw new Error("Could not claim feedback; check the migration");
  if (!data) throw new Error("Another worker is checking this feedback");
  const job = data as QualityJob;
  if (["done","needs_attention"].includes(job.state)) return { state: job.state };
  async function save(update: Record<string, unknown>) {
    const { data: changed, error } = await db.from("feedback_quality_jobs").update({ ...update, updated_at: new Date().toISOString() })
      .eq("submission_id", submissionId).eq("lease_token", token).gt("lease_until", new Date().toISOString()).select("submission_id");
    if (error || !changed?.length) throw new Error("Feedback lease lost or persistence failed");
  }
  async function hold(reason: string) {
    await save({ state: "needs_attention", last_error: reason, lease_token: null, lease_until: null });
    await logDecision(review!.order_id, "review_quality", "needs_attention", reason);
    return { state: "needs_attention" };
  }
  try {
    if (review.status !== "pending" && review.status !== job.decision?.outcome) return await hold("Local review status conflicts with this agent; reconcile before changing payment.");
    if (!review.submitted_at || !review.answers_json) throw new Error("Reviewer answers have not arrived yet");
    // Missing historical timestamps/evidence are not grounds for denying payment.
    if (!review.terac_participant_id || !Number.isFinite(review.duration_s) || review.duration_s < 60) return await hold("Feedback is missing verified assignment or timing evidence; payment left pending.");
    let answers: Record<string,string>;
    try { answers = parseReviewAnswers(review.answers_json); } catch { return await hold("Feedback does not match the saved answer format; payment left pending."); }
    const { data: recruitment, error: recruitmentError } = await db.from("recruitment_jobs").select("opportunity_id").eq("order_id", review.order_id).single();
    if (recruitmentError || !recruitment?.opportunity_id) throw new Error("No verified Terac opportunity for this order");
    const { data: shots, error: shotError } = await db.from("screenshots").select("position,storage_path").eq("order_id", review.order_id).order("position");
    if (shotError || !shots?.length || shots.length > 10) throw new Error("Screenshots unavailable; cannot assess feedback fairly");
    const inputHash = createHash("sha256").update(JSON.stringify({ answers, duration: review.duration_s, shots })).digest("hex");
    if (job.decision && job.input_hash !== inputHash) return await hold("Feedback evidence changed after a decision was recorded; payment left pending.");
    return await withTerac(async call => {
      const remote = await call<Submission>("terac_get_submission", { submissionId });
      assertSubmission(remote,submissionId,recruitment.opportunity_id,review.terac_participant_id);
      if (!job.decision && ["approved","rejected"].includes(remote.status)) return hold("Terac was already decided outside this agent; reconcile before changing local review counts.");
      if (!job.decision && remote.status !== "awaiting_review") throw new Error("Terac is not awaiting review yet");
      if (job.decision && ["approved","rejected"].includes(remote.status) && remote.status !== job.decision.outcome) return hold("Terac outcome conflicts with the saved assessment; manual reconciliation required.");
      let decision = job.decision;
      if (!decision) {
        if (job.attempts > 3) return hold("Repeated assessment failures; payment left pending for investigation.");
        const { data: signed, error: signError } = await db.storage.from("screenshots").createSignedUrls(shots.map(s => s.storage_path), 300);
        if (signError || !signed || signed.some(s => !s.signedUrl)) throw new Error("Screenshot access failed");
        const images = await Promise.all(signed.map(async (s,i) => {
          const response = await fetch(s.signedUrl!, { signal: AbortSignal.timeout(15_000) });
          if (!response.ok) throw new Error("Screenshot download failed");
          const image = await sharp(Buffer.from(await response.arrayBuffer()), { limitInputPixels: 40_000_000 }).rotate().resize({width:1568,height:1568,fit:"inside",withoutEnlargement:true}).flatten({background:"#fff"}).jpeg({quality:85}).toBuffer();
          return { position: shots[i].position, data: image.toString("base64") };
        }));
        let assessment;
        try { assessment = await assessFeedback(images,answers); }
        catch { assessment = await assessFeedback(images,answers); } // One bounded provider retry; never reject on error.
        decision = decideFeedback(assessment,answers,shots.map(s => s.position));
        await save({ assessment, decision, input_hash: inputHash, policy_version: FEEDBACK_POLICY_VERSION, model: FEEDBACK_MODEL });
        if (decision.outcome === "needs_attention") return hold(decision.reason);
      }
      if (decision.outcome === "needs_attention") return hold(decision.reason);
      // Fencing check immediately before the money-affecting operation.
      await save({ last_error: null });
      await applyFeedbackDecision(call,submissionId,recruitment.opportunity_id,review.terac_participant_id,decision);
      const { error: finishError } = await db.rpc("finish_feedback_quality", { p_submission: submissionId, p_token: token, p_outcome: decision.outcome });
      if (finishError) throw new Error("Could not finalize confirmed feedback decision");
      // The approval that completes the order triggers its report; Terac's webhook gets its reply first.
      if (decision.outcome === "approved") after(() => deliverReportIfComplete(review.order_id));
      return { state: "done", outcome: decision.outcome };
    });
  } catch {
    // Preserve any saved decision so retries reconcile Terac rather than re-grade.
    await save({ state: "retry", last_error: "Feedback processing interrupted; retry will reconcile saved decision with Terac.", lease_token: null, lease_until: null });
    throw new Error("Feedback needs retry");
  }
}

export async function processFeedbackEvent(event: {event_id: string; resource_id?: string; to?: string}) {
  if (["awaiting_review","approved","rejected"].includes(event.to ?? "")) {
    await processFeedback(event.resource_id!);
  }
  const { error } = await db.from("terac_webhook_events").update({ processed_at: new Date().toISOString() }).eq("event_id", event.event_id);
  if (error) throw new Error("Could not acknowledge processed event");
}
