import type { TeracCall } from "./terac";
import type { FeedbackDecision } from "./feedback-policy";
export type Submission = { id: string; opportunity_id: string; participant_id: string; status: string };
export function assertSubmission(s: Submission, id: string, opportunity: string, participant: string) {
  if (s.id !== id || s.opportunity_id !== opportunity || s.participant_id !== participant) throw new Error("Submission identity mismatch");
}
export async function applyFeedbackDecision(call: TeracCall, id: string, opportunity: string, participant: string, decision: FeedbackDecision) {
  if (!["approved","rejected"].includes(decision.outcome)) throw new Error("No actionable feedback decision");
  const current = await call<Submission>("terac_get_submission", { submissionId: id });
  assertSubmission(current,id,opportunity,participant);
  if (current.status === decision.outcome) return; // Prior attempt succeeded; no second mutation.
  if (current.status !== "awaiting_review") throw new Error("Terac submission is not awaiting this decision");
  if (decision.outcome === "approved") await call("terac_approve_submission", { submissionId: id });
  else await call("terac_reject_submission", { submissionId: id, rejection_category: decision.category, rejection_reason: decision.reason });
  const confirmed = await call<Submission>("terac_get_submission", { submissionId: id });
  assertSubmission(confirmed,id,opportunity,participant);
  if (confirmed.status !== decision.outcome) throw new Error("Terac decision not yet confirmed");
}
