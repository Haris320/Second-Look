import "server-only";
import { db } from "./supabase";
import { whop, whopBizId } from "./whop";
import { orderLink } from "./order-links";
import { logDecision } from "./log";

// Whop messages to the buyer, sent by the business through a Whop support chat (business API keys can't send DMs,
// and Whop won't open a support chat with the business owner, so test with another account).
// Never throws: a failed message is logged and the order carries on.
const MESSAGES = {
  paid: (link: string) =>
    `Thanks for your order! Real people are about to review your dating profile, and your results arrive by tonight.\n\nYour private results link (don't share it):\n${link}\n\nWe'll also message you here when your results are in.\n\n— Second Look`,
  results: (link: string) =>
    `Your results are in! Your reviewers have weighed in on your photos and prompts.\n\nSee your report:\n${link}\n\n— Second Look`,
};

export async function messageBuyer(orderId: string, kind: keyof typeof MESSAGES) {
  try {
    const { data: order } = await db.from("orders").select("whop_payment_id").eq("id", orderId).single();
    if (!order?.whop_payment_id) throw new Error("order has no Whop payment");
    const payment = await whop.payments.retrieve({ id: order.whop_payment_id });
    if (!payment.user?.id) throw new Error("payment has no Whop buyer");
    const channel = await whop.supportChannels.create({ account_id: whopBizId, user_id: payment.user.id });
    const message = await whop.messages.create({ channel_id: channel.id, content: MESSAGES[kind](orderLink(orderId)) });
    await logDecision(orderId, "notify", `${kind}_sent`, `Whop message ${message.id} sent to ${payment.user.username}`);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    await logDecision(orderId, "notify", `${kind}_failed`, `Whop message not sent: ${reason}`.slice(0, 300));
  }
}

// For the report builder: call right after it sets an order to 'done'.
export const notifyResultsReady = (orderId: string) => messageBuyer(orderId, "results");
