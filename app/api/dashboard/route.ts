import { after } from "next/server";
import { dashboardAccess } from "@/lib/dashboard-access";
import { kickReconcile } from "@/lib/reconcile-kick";
import { db } from "@/lib/supabase";
import { privateHeaders } from "@/lib/order-access";
export async function GET() {
  if (!(await dashboardAccess()))
    return Response.json(
      { error: "Sign in to view the team dashboard." },
      { status: 401, headers: privateHeaders },
    );
  const [orders, decisions, tests] = await Promise.all([
    db
      .from("orders")
      .select(
        "id,tier,status,reviews_done,review_target,amount_cents,created_at,paid_at,delivered_at",
      )
      .order("created_at", { ascending: false })
      .limit(100),
    db
      .from("decisions")
      .select("id,order_id,step,choice,reason,created_at")
      .neq("choice", "heartbeat")
      .order("created_at", { ascending: false })
      .limit(60),
    // Team test purchases are marked with a logged manual decision, so revenue and counts exclude them.
    db.from("decisions").select("order_id").eq("step", "manual").eq("choice", "test_order"),
  ]);
  if (orders.error || decisions.error || tests.error)
    return Response.json(
      { error: "Could not load dashboard data." },
      { status: 503, headers: privateHeaders },
    );
  const testIds = new Set((tests.data ?? []).map((t) => t.order_id));
  // Someone watching the dashboard keeps the agent's reconcile clock ticking (deduplicated server-side).
  after(() => kickReconcile("dashboard"));
  return Response.json(
    {
      orders: (orders.data ?? []).map((o) => ({ ...o, is_test: testIds.has(o.id) })),
      decisions: decisions.data,
    },
    { headers: privateHeaders },
  );
}
