import { db } from "@/lib/supabase";
import { logDecision } from "@/lib/log";
import { isSalesOpen } from "@/lib/whop";
import { AUDIENCES, TIERS } from "@/lib/tiers";

// Flow A step 1: create the order. Screenshots and checkout come next via /api/orders/[id]/*.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").trim();
  const { audience, tier, ownProfile, adult } = body;

  if (!/^\S+@\S+\.\S+$/.test(email)) return Response.json({ error: "Enter a valid email." }, { status: 400 });
  if (!(audience in AUDIENCES)) return Response.json({ error: "Pick who should review you." }, { status: 400 });
  if (!(tier in TIERS)) return Response.json({ error: "Pick a package." }, { status: 400 });
  if (ownProfile !== true || adult !== true) {
    return Response.json({ error: "Please confirm it's your own profile and you're 18 or older." }, { status: 400 });
  }
  if (!(await isSalesOpen())) {
    return Response.json({ error: "We're at capacity right now. Please check back soon." }, { status: 503 });
  }

  const { data, error } = await db
    .from("orders")
    .insert({ email, audience, tier, review_target: TIERS[tier as keyof typeof TIERS].reviews })
    .select("id")
    .single();
  if (error) return Response.json({ error: "Couldn't create your order. Try again." }, { status: 500 });

  await logDecision(data.id, "order", "created", `${tier} order for ${audience}, awaiting payment`);
  return Response.json({ orderId: data.id });
}
