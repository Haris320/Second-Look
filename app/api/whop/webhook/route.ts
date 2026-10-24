import { after } from "next/server";
import { unwrapWebhook, WebhookVerificationError } from "@whop/sdk/helpers";
import { db } from "@/lib/supabase";
import { logDecision } from "@/lib/log";
import { whop, whopWebhookSecret, toCents } from "@/lib/whop";
import { TIERS, tierForAmount } from "@/lib/tiers";
import { runFirstRead } from "@/lib/first-read";

type WhopEvent = { type?: string; action?: string; data?: { id?: string } };

// The AI first read runs inside after(), so give the function time for one Claude call.
export const maxDuration = 300;

export async function POST(request: Request) {
  const payload = await request.text();
  let event: WhopEvent;
  try {
    event = unwrapWebhook<WhopEvent>(payload, {
      headers: Object.fromEntries(request.headers.entries()),
      key: whopWebhookSecret,
    });
  } catch (err) {
    if (err instanceof WebhookVerificationError) return new Response("bad signature", { status: 401 });
    return new Response("webhook secret not configured", { status: 500 });
  }

  // Only the event name and payment ID come from the payload; everything else is re-fetched from Whop.
  const eventName = event.type ?? event.action;
  const paymentId = event.data?.id;
  if (eventName !== "payment.succeeded" || !paymentId) return new Response("ignored");

  const payment = await whop.payments.retrieve({ id: paymentId });
  if (payment.status !== "paid") {
    await logDecision(null, "payment", "ignored", `Payment ${paymentId} reported succeeded but status is ${payment.status}`);
    return new Response("not paid");
  }

  const amountCents = toCents(payment.usd_total?.amount ?? payment.total?.amount);
  const orderId = typeof payment.metadata?.order_id === "string" ? payment.metadata.order_id : null;

  if (orderId) {
    // Flow A: the order already exists with screenshots. The status guard makes webhook retries no-ops.
    // It waits in 'screening' until the AI first read moves it to 'paid' (sent to reviewers) or 'held'.
    const { data } = await db
      .from("orders")
      .update({ status: "screening", whop_payment_id: payment.id, amount_cents: amountCents, paid_at: new Date().toISOString() })
      .eq("id", orderId)
      .eq("status", "pending_payment")
      .select("id");
    if (data?.length) {
      await logDecision(orderId, "payment", "paid", `Whop payment ${payment.id} confirmed`);
      after(() => runFirstRead(orderId));
    }
    return new Response("ok");
  }

  // Flow B: paid on the marketplace with no order yet. Create one and wait for the upload on /start.
  const tier = tierForAmount((amountCents ?? 0) / 100);
  if (!tier) {
    await logDecision(null, "payment", "unmatched", `Payment ${payment.id} of ${amountCents} cents matches no tier`);
    return new Response("ok");
  }
  const { data } = await db
    .from("orders")
    .upsert(
      {
        email: payment.customer_email ?? "",
        tier,
        review_target: TIERS[tier].reviews,
        status: "awaiting_upload",
        whop_payment_id: payment.id,
        amount_cents: amountCents,
        paid_at: new Date().toISOString(),
      },
      { onConflict: "whop_payment_id", ignoreDuplicates: true },
    )
    .select("id");
  if (data?.length) {
    await logDecision(data[0].id, "payment", "awaiting_upload", `Marketplace payment ${payment.id}; waiting for the buyer's screenshots`);
  }
  return new Response("ok");
}
