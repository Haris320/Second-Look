import { db } from "@/lib/supabase";

// Flow B: a marketplace buyer enters the email they paid with; return their oldest order still waiting for screenshots.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").trim();
  if (!email) return Response.json({ error: "Enter the email you paid with." }, { status: 400 });

  const { data } = await db
    .from("orders")
    .select("id, tier")
    .ilike("email", email)
    .eq("status", "awaiting_upload")
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (!data) {
    return Response.json(
      { error: "We couldn't find a payment for that email yet. Payments can take a minute to arrive; try again shortly." },
      { status: 404 },
    );
  }
  return Response.json({ orderId: data.id, tier: data.tier });
}
