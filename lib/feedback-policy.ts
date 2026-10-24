// v2 (2026-10-24): approvals need confidence >= 0.7, rejections still >= 0.9. The first real review was a clearly
// good one that Claude approved at 0.85, and the old single 0.9 bar left it unpaid and the order stalled.
// Approving a decent review is low-risk; wrongly rejecting one denies a person their pay.
export const FEEDBACK_POLICY_VERSION = "feedback-v2";
export const APPROVE_CONFIDENCE = 0.7;
export const REJECT_CONFIDENCE = 0.9;
export type FeedbackAssessment = {
  verdict: "approve" | "reject" | "uncertain";
  confidence: number;
  complete: boolean;
  grounded: boolean;
  actionable: boolean;
  respectful: boolean;
  reason: string;
  screenshot_positions: number[];
  issues: { field: "works" | "changes" | "prompts"; quote: string; rule: "incomplete" | "low_quality" | "failed_instructions"; explanation: string }[];
};
export type FeedbackDecision = { outcome: "approved" | "rejected" | "needs_attention"; reason: string; category?: "incomplete" | "low_quality" | "failed_instructions" };
export function decideFeedback(a: FeedbackAssessment, answers: Record<string, string>, positions: number[]): FeedbackDecision {
  const hold = { outcome: "needs_attention" as const, reason: "Feedback assessment is uncertain or lacks verifiable evidence." };
  if (!a || !["approve", "reject", "uncertain"].includes(a.verdict) || !Number.isFinite(a.confidence) || a.confidence < APPROVE_CONFIDENCE || a.confidence > 1 || typeof a.reason !== "string" || a.reason.trim().length < 10 || a.reason.length > 1500 || ![a.complete,a.grounded,a.actionable,a.respectful].every(x => typeof x === "boolean") || !Array.isArray(a.issues) || !Array.isArray(a.screenshot_positions) || a.screenshot_positions.some(p => !positions.includes(p))) return hold;
  if (a.verdict === "approve" && a.complete && a.grounded && a.actionable && a.respectful && a.issues.length === 0 && a.screenshot_positions.length > 0) return { outcome: "approved", reason: a.reason };
  if (a.verdict !== "reject" || a.confidence < REJECT_CONFIDENCE || a.issues.length === 0 || (a.complete && a.grounded && a.actionable && a.respectful)) return hold;
  // Non-payment needs evidence from the actual answer, not invented quotations.
  for (const issue of a.issues) {
    if (!issue || !["works","changes","prompts"].includes(issue.field) || typeof issue.quote !== "string" || issue.quote.trim().length < 5 || !answers[issue.field]?.includes(issue.quote) || !["incomplete","low_quality","failed_instructions"].includes(issue.rule) || typeof issue.explanation !== "string" || issue.explanation.trim().length < 10) return hold;
  }
  return { outcome: "rejected", category: a.issues[0].rule, reason: a.reason };
}
