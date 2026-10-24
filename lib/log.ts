import "server-only";
import { db } from "./supabase";

// Every agent decision gets one row with a one-line reason; the dashboard shows these live.
export async function logDecision(orderId: string | null, step: string, choice: string, reason: string) {
  const { error } = await db.from("decisions").insert({ order_id: orderId, step, choice, reason });
  if (error) console.error("logDecision failed", error);
}
