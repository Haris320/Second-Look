import { after } from "next/server";
import { processFeedbackEvent } from "@/lib/feedback-quality";
import { db } from "@/lib/supabase";
import { receiveTeracWebhook } from "@/lib/terac-webhook";

export const maxDuration = 300;

export async function POST(request: Request) {
  return receiveTeracWebhook(request, process.env.TERAC_WEBHOOK_SECRET, async (event) => {
    const { data, error } = await db.rpc("receive_terac_webhook", { p_event: event });
    if (error) throw error;
    // Terac gives a delivery 10 seconds; the Claude quality check takes longer. Answer as soon as the
    // event is stored and do the work after the response. If it fails, processed_at stays null and
    // /api/agent/reconcile picks the event up. Duplicate deliveries also re-run processing (lease-protected).
    after(() => processFeedbackEvent(event).catch(e => console.error("Terac event processing failed", event.event_id, e)));
    return data === true;
  });
}
