import { db } from "@/lib/supabase";
import { receiveTeracWebhook } from "@/lib/terac-webhook";

export async function POST(request: Request) {
  return receiveTeracWebhook(request, process.env.TERAC_WEBHOOK_SECRET, async (event) => {
    const { data, error } = await db.rpc("receive_terac_webhook", { p_event: event });
    if (error) throw error;
    return data === true;
  });
}
