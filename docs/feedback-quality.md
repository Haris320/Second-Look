# AI feedback approval through Terac MCP

When Terac reports `awaiting_review`, our signed webhook stores the event, then checks the assigned review's saved answers against the customer's screenshots using Claude. Approval and rejection use `terac_approve_submission` / `terac_reject_submission` over MCP, authenticated by the existing organization key. Rejection includes a category and reason; approval pays the reviewer.

## Activation

1. Apply the webhook and recruitment migrations first, then run `supabase/migrations/2026-10-24-feedback-quality.sql` in Supabase SQL Editor. This adds a private job/audit table and two service-role-only transaction functions.
2. Deploy the updated webhook and worker. Set `FEEDBACK_REVIEW_ENABLED=true` in Vercel and redeploy. The existing `ANTHROPIC_API_KEY`, `TERAC_API_KEY`, `TERAC_WEBHOOK_SECRET`, and Supabase server credentials are required. Local/default activation is false until the migration is applied.
3. Subscribe to `submission.status.change` in Terac (it includes approvals). Also receiving `submission.approved` is supported and deduplicated at the submission level.
4. Validate a controlled sandbox submission before relying on live payouts. Unit/integration tests mock MCP financial operations; the synthetic live Claude tests do not call approval/rejection tools or use customer images.

## Decision policy

Claude sees the actual screenshots, resized to at most 1568 pixels, and the saved `like`, `works`, `changes`, and `prompts` fields. It checks completeness, grounding, actionability, and respectful content. Thoughtful negative opinions, concise writing, dialect and spelling mistakes are not rejection reasons. It must not infer AI authorship from writing style. A model confidence value alone is not sufficient: approval requires all criteria, valid screenshot references, and no issues; rejection requires a clear failed criterion and exact quotes present in the actual feedback. Model confidence must be at least 0.7 to approve and at least 0.9 to reject (`feedback-v2`; v1 used 0.9 for both and held the first real, clearly good review at 0.85). These thresholds are conservative gates, not calibrated accuracy guarantees. When the policy version changes, `/api/agent/reconcile` re-opens `needs_attention` holds whose decision was made under the old version and grades them again.

Uncertain/malformed assessments, missing assignment/timing evidence, or conflicting external decisions are held as `needs_attention`; they do not deny payment. API failures retry once within the request and return 503 if still failing. After three failed worker claims without a saved decision, the next attempt holds for investigation. Missing images or answers remain retryable instead of being blamed on the reviewer.

## Reliability and audit

- Claim one five-minute lease per submission in Supabase. Simultaneous webhook deliveries cannot both grade/apply the same review.
- Save the assessment, policy version, model, reason, and input hash before calling any payment tool. The hash covers the immutable saved answers, server duration, and screenshot manifest.
- Re-fetch the submission through MCP and check opportunity + participant identity. Only `awaiting_review` may be mutated.
- On a lost response, retries reuse the saved decision and inspect Terac first. If Terac already has the intended status, reconcile locally without another approval/rejection. Conflicting outcomes require attention.
- Finalization locks the order, updates the review once, recomputes `reviews_done` from approved rows, and logs the decision in one transaction. Rejections never count. RLS blocks browser access to job data.
- Webhook processing is awaited, up to the route's 300-second limit. Terac may time out earlier and retry; leases and persisted decisions handle that. A killed worker can be reclaimed after its lease expires. No separate polling loop is required for normal events.
- `processed_at` means the webhook's feedback work has finished or was held for attention, not that the customer report is delivered. Orders are not set done and screenshots are not deleted by this worker.

For retryable failures or already-stored backlog events, call `POST /api/agent/review-feedback` with `Authorization: Bearer <CRON_SECRET>` and JSON `{ "submissionId": "..." }`. Never put this secret in client code. This route does not override needs_attention; inspect the evidence before resetting such jobs. Keep the original saved decision when reconciling an uncertain MCP response. The dashboard decisions log shows completed/held decisions, and `feedback_quality_jobs` stores detailed evidence and retry state.

Automatic replacement scheduling is controlled by Terac; rejected reviews free a local slot, but the app does not launch extra opportunities. Final report generation and customer notifications are not part of this worker.
