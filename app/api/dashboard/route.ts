import { dashboardAccess } from "@/lib/dashboard-access";
import { db } from "@/lib/supabase";
import { privateHeaders } from "@/lib/order-access";
export async function GET() {
  if (!(await dashboardAccess()))
    return Response.json(
      { error: "Sign in to view the team dashboard." },
      { status: 401, headers: privateHeaders },
    );
  const [orders, decisions] = await Promise.all([
    db
      .from("orders")
      .select(
        "id,tier,status,reviews_done,review_target,amount_cents,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(100),
    db
      .from("decisions")
      .select("id,step,choice,reason,created_at")
      .order("created_at", { ascending: false })
      .limit(25),
  ]);
  if (orders.error || decisions.error)
    return Response.json(
      { error: "Could not load dashboard data." },
      { status: 503, headers: privateHeaders },
    );
  return Response.json(
    { orders: orders.data, decisions: decisions.data },
    { headers: privateHeaders },
  );
}
