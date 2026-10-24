import { processFeedbackEvent } from "@/lib/feedback-quality";
import { db } from "@/lib/supabase";
import { receiveTeracWebhook } from "@/lib/terac-webhook";

export const maxDuration = 300;

export async function POST(request: Request) {
  return receiveTeracWebhook(request, process.env.TERAC_WEBHOOK_SECRET, async (event) => {
    const { data, error } = await db.rpc("receive_terac_webhook", { p_event: event });
    if (error) throw error;
    // Also resume duplicate deliveries after a previous processing failure.
    await processFeedbackEvent(event);
    return data === true;
  });
}
