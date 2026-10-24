import { db } from "@/lib/supabase";
import { hasAccess, sameOrigin } from "@/lib/order-access";
import { verifyUploads } from "@/lib/verify-uploads";
import { matchesCurrentPackage, type Tier } from "@/lib/tiers";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!sameOrigin(request) || !(await hasAccess(id)))
    return Response.json({ error: "Access denied." }, { status: 403 });
  const sandbox = process.env.WHOP_ENVIRONMENT === "sandbox";
  if (
    !(sandbox
      ? process.env.WHOP_SANDBOX_API_KEY && process.env.WHOP_SANDBOX_BIZ_ID
      : process.env.WHOP_API_KEY && process.env.WHOP_BIZ_ID) ||
    !process.env.PUBLIC_BASE_URL
  )
    return Response.json(
      {
        error:
          "Checkout is not open yet. Your screenshots are saved securely; no payment has been taken.",
      },
      { status: 503 },
    );
  const { data: order } = await db
    .from("orders")
    .select("tier,status,review_target")
    .eq("id", id)
    .single();
  if (!order || order.status !== "pending_payment")
    return Response.json(
      { error: "This order is not awaiting payment." },
      { status: 409 },
    );
  if (!matchesCurrentPackage(order.tier, order.review_target)) {
    return Response.json(
      {
        error:
          "This draft uses an older review option. Please create a new order and select one or three reviewers.",
      },
      { status: 409 },
    );
  }
  if (!(await verifyUploads(id)))
    return Response.json(
      { error: "Please finish uploading all screenshots before paying." },
      { status: 400 },
    );
  try {
    const { createCheckout } = await import("@/lib/whop");
    const checkout = await createCheckout(id, order.tier as Tier);
    const { error } = await db
      .from("orders")
      .update({ whop_checkout_id: checkout.checkoutId })
      .eq("id", id)
      .eq("status", "pending_payment");
    if (error) throw error;
    return Response.json({ url: checkout.purchaseUrl });
  } catch {
    return Response.json(
      {
        error:
          "Checkout is temporarily unavailable. Your uploads are safe; please try again.",
      },
      { status: 503 },
    );
  }
}
