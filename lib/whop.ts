import "server-only";
import { WhopClient, WhopEnvironment } from "@whop/sdk";
import { TIERS, type Tier } from "./tiers";

// Production unless WHOP_ENVIRONMENT=sandbox; each environment has its own key and business.
const sandbox = process.env.WHOP_ENVIRONMENT === "sandbox";

export const whopBizId = (sandbox ? process.env.WHOP_SANDBOX_BIZ_ID : process.env.WHOP_BIZ_ID)!;
export const whopWebhookSecret = sandbox
  ? process.env.WHOP_SANDBOX_WEBHOOK_SECRET
  : process.env.WHOP_WEBHOOK_SECRET;

export const whop = new WhopClient({
  token: (sandbox ? process.env.WHOP_SANDBOX_API_KEY : process.env.WHOP_API_KEY)!,
  environment: sandbox ? WhopEnvironment.Sandbox : WhopEnvironment.Production,
});

// Emergency switch only: there is no automatic sales cap (we top up Terac credits instead). Use it to stop
// taking orders by hand, e.g. if Terac goes down for good.
// Closing hides every visible product and tags it, so reopening only restores what we hid.
// The tag also stops createCheckout, which uses inline plans that no product listing controls.
export async function setSalesOpen(open: boolean) {
  for await (const product of await whop.products.list({ account_id: whopBizId })) {
    const paused = product.metadata?.sales_paused === true;
    if (!open && product.visibility === "visible") {
      await whop.products.update({ id: product.id, visibility: "hidden", metadata: { ...product.metadata, sales_paused: true } });
    } else if (open && paused) {
      await whop.products.update({ id: product.id, visibility: "visible", metadata: { ...product.metadata, sales_paused: false } });
    }
  }
}

export async function isSalesOpen() {
  for await (const product of await whop.products.list({ account_id: whopBizId })) {
    if (product.metadata?.sales_paused === true) return false;
  }
  return true;
}

// Flow A: one checkout per order. The order ID rides along in metadata, which Whop copies onto the payment.
export async function createCheckout(orderId: string, tier: Tier) {
  if (!(await isSalesOpen())) throw new Error("Sales are paused");
  const { name, reviews, priceUsd } = TIERS[tier];
  const config = await whop.checkoutConfigurations.create({
    account_id: whopBizId,
    plan: {
      title: name,
      description: `${reviews} human ${reviews === 1 ? "review" : "reviews"} of your dating profile`,
      initial_price: priceUsd,
      currency: "usd",
      plan_type: "one_time",
    },
    metadata: { order_id: orderId },
    redirect_url: `${process.env.PUBLIC_BASE_URL}/order/${orderId}`,
  });
  return { checkoutId: config.id, purchaseUrl: config.purchase_url };
}

// Whop amounts are exact decimal strings ("9.00").
export function toCents(amount: string | undefined | null) {
  return amount ? Math.round(Number(amount) * 100) : null;
}
