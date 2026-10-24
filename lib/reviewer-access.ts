import "server-only";
import { timingSafeEqual } from "node:crypto";
import { db } from "./supabase";
import { withTerac } from "./terac";
import { decideProfileQuality } from "./profile-quality";

async function verifyTaskLink(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("Invalid task link");
  const b = value as Record<string, unknown>;
  for (const k of ["orderId", "submissionId", "token"]) if (typeof b[k] !== "string" || !/^[a-zA-Z0-9_-]{1,200}$/.test(b[k] as string)) throw new Error("Invalid task link");
  const orderId = b.orderId as string;
  const submissionId = b.submissionId as string;
  const { data: job, error } = await db.from("recruitment_jobs").select("opportunity_id,task_token,state").eq("order_id", orderId).single();
  if (error || !job?.opportunity_id || !["active", "launching", "retryable"].includes(job.state)) throw new Error("Task not available");
  const a = Buffer.from(b.token as string), expected = Buffer.from(job.task_token);
  if (a.length !== expected.length || !timingSafeEqual(a, expected)) throw new Error("Invalid task link");
  return { orderId, submissionId, job };
}

// For submitting answers: the submission was already verified against Terac when the reviewer started
// (that's what created the local row), so a Terac hiccup at submit time must not lose their work.
export async function verifyAssignedReviewer(value: unknown) {
  const { orderId, submissionId } = await verifyTaskLink(value);
  const { data: review, error } = await db.from("reviews").select("id,terac_participant_id,status").eq("order_id", orderId).eq("terac_submission_id", submissionId).maybeSingle();
  if (error || !review || review.status === "rejected") throw new Error("No assignment for this task");
  return { orderId, submissionId, participantId: review.terac_participant_id as string | null };
}

export async function verifyReviewer(value: unknown) {
  const { orderId, submissionId, job } = await verifyTaskLink(value);
  const submission = await withTerac(call => call<{id: string; opportunity_id: string; participant_id: string; status: string}>("terac_get_submission", { submissionId }));
  if (submission.id !== submissionId || submission.opportunity_id !== job.opportunity_id || !submission.participant_id || !["in_progress", "awaiting_review", "approved"].includes(submission.status)) throw new Error("Submission is not eligible");
  const { data: order, error: orderError } = await db.from("orders").select("status,first_read_json,whop_payment_id,paid_at").eq("id", orderId).single();
  const { data: shots, error: shotsError } = await db.from("screenshots").select("position,storage_path").eq("order_id", orderId).order("position");
  if (orderError || shotsError || !order || !["paid", "in_review"].includes(order.status) || !order.whop_payment_id || !order.paid_at || !shots?.length || decideProfileQuality(order.first_read_json, shots.map(s => s.position)).status !== "paid") throw new Error("Profile is not available for review");
  return { orderId, submissionId, participantId: submission.participant_id, submissionStatus: submission.status, shots };
}

export function parseReviewAnswers(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("Missing feedback");
  const a = value as Record<string, unknown>;
  if (!["yes", "maybe", "no"].includes(String(a.like))) throw new Error("Choose your first impression");
  const result: Record<string, string> = { like: String(a.like) };
  for (const k of ["works", "changes", "prompts"]) {
    if (typeof a[k] !== "string" || a[k].trim().length < 30 || a[k].trim().length > 3000) throw new Error("Each written answer needs 30–3000 characters");
    result[k] = a[k].trim();
  }
  return result;
}
