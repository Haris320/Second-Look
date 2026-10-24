import { referralSummary } from "@/lib/referrals";
import { db } from "@/lib/supabase";
import { hasAccess, privateHeaders, sameOrigin } from "@/lib/order-access";
import { currentOrderLink } from "@/lib/order-links";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!(await hasAccess(id)))
    return Response.json(
      {
        error:
          "Open this order from its private link, or in the browser you used to upload your profile.",
      },
      { status: 403, headers: privateHeaders },
    );
  const { data, error } = await db
    .from("orders")
    .select(
      "id,audience,tier,amount_cents,review_target,reviews_done,status,report_json,first_read_json,access_key_hash,created_at",
    )
    .eq("id", id)
    .single();
  if (error || !data)
    return Response.json(
      { error: "Order not found." },
      { status: 404, headers: privateHeaders },
    );
  // A held or rejected first read describes why; that stays on the team dashboard.
  if (data.status === "held" || data.status === "needs_reupload") data.first_read_json = null;
  const { access_key_hash, ...order } = data;
  const privateLink = await currentOrderLink(id, access_key_hash);
  const { data: screenshots } = await db
    .from("screenshots")
    .select("id,storage_path,position")
    .eq("order_id", id)
    .order("position");
  const images = await Promise.all(
    (screenshots ?? []).map(async (s) => {
      const { data: signed } = await db.storage
        .from("screenshots")
        .createSignedUrl(s.storage_path, 300);
      return { id: s.id, position: s.position, url: signed?.signedUrl ?? null };
    }),
  );
  const sandbox = process.env.WHOP_ENVIRONMENT === "sandbox";
  const checkoutReady = Boolean(
    (sandbox
      ? process.env.WHOP_SANDBOX_API_KEY && process.env.WHOP_SANDBOX_BIZ_ID
      : process.env.WHOP_API_KEY && process.env.WHOP_BIZ_ID) &&
      process.env.PUBLIC_BASE_URL,
  );
  const referral = await referralSummary(id);
  return Response.json(
    { order, screenshots: images, checkoutReady, privateLink, referral },
    { headers: privateHeaders },
  );
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!sameOrigin(request) || !(await hasAccess(id)))
    return Response.json({ error: "Access denied." }, { status: 403 });
  const { data: order } = await db
    .from("orders")
    .select("status,whop_checkout_id")
    .eq("id", id)
    .single();
  if (!order || order.status !== "pending_payment" || order.whop_checkout_id)
    return Response.json(
      {
        error:
          "Only unpaid drafts without an active checkout can be deleted here.",
      },
      { status: 409 },
    );
  const { data: files } = await db
    .from("screenshots")
    .select("storage_path")
    .eq("order_id", id);
  if (files?.length) {
    const { error } = await db.storage
      .from("screenshots")
      .remove(files.map((f) => f.storage_path));
    if (error)
      return Response.json(
        { error: "Could not remove the files. Please retry." },
        { status: 503 },
      );
  }
  const { error } = await db
    .from("orders")
    .delete()
    .eq("id", id)
    .eq("status", "pending_payment")
    .is("whop_checkout_id", null);
  if (error)
    return Response.json(
      { error: "Could not remove the draft. Please retry." },
      { status: 503 },
    );
  return Response.json({ ok: true });
}
