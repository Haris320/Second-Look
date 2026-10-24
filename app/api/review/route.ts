import { db } from "@/lib/supabase";
import { parseReviewAnswers, verifyReviewer } from "@/lib/reviewer-access";

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length")) > 16000) return new Response(null, { status: 413 });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid request" }, { status: 400 }); }
  try {
    const access = await verifyReviewer(body);
    if (body.action === "start") {
      // A completed Terac submission must already have a local assignment.
      if (access.submissionStatus !== "in_progress") {
        const { data } = await db.from("reviews").select("id").eq("order_id", access.orderId).eq("terac_submission_id", access.submissionId).maybeSingle();
        if (!data) return Response.json({ error: "This task is no longer accepting work" }, { status: 409 });
      }
      const { data: review, error } = await db.rpc("assign_terac_review", { p_order_id: access.orderId, p_submission: access.submissionId, p_participant: access.participantId });
      if (error) return Response.json({ error: "This task has no available review slots" }, { status: 409 });
      if (review.submitted_at) return Response.json({ submitted: true, callbackUrl: callback(access.submissionId) });
      const { data: signed, error: signError } = await db.storage.from("screenshots").createSignedUrls(access.shots.map(s => s.storage_path), 600);
      if (signError || !signed || signed.some(s => !s.signedUrl)) throw new Error("Could not load screenshots");
      return Response.json({ screenshots: signed.map((s, i) => ({ position: access.shots[i].position, url: s.signedUrl })), startedAt: review.created_at }, { headers: { "Cache-Control": "no-store" } });
    }
    if (body.action === "submit") {
      const answers = parseReviewAnswers(body.answers);
      const { error } = await db.rpc("submit_terac_review", { p_order_id: access.orderId, p_submission: access.submissionId, p_answers: answers });
      if (error) return Response.json({ error: "Could not submit. Spend at least 60 seconds reviewing, then try again." }, { status: 409 });
      return Response.json({ submitted: true, callbackUrl: callback(access.submissionId) });
    }
    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch {
    return Response.json({ error: "Cannot access this review. Open your assigned task from Terac and try again." }, { status: 403 });
  }
}
function callback(submissionId: string) {
  const url = new URL("https://terac.com/api/external/callback");
  url.searchParams.set("teracSubmissionId", submissionId);
  url.searchParams.set("result", "completed");
  return url.toString();
}
