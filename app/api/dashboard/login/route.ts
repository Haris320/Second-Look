import { grantDashboard, matchesPassword } from "@/lib/dashboard-access";
import { sameOrigin } from "@/lib/order-access";
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return Response.json({ error: "Access denied." }, { status: 403 });
  if (!process.env.DASHBOARD_PASSWORD)
    return Response.json(
      { error: "The team dashboard has not been configured yet." },
      { status: 503 },
    );
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  if (
    !body ||
    typeof body.password !== "string" ||
    body.password.length > 200 ||
    !matchesPassword(body.password)
  ) {
    await new Promise((r) => setTimeout(r, 700));
    return Response.json(
      { error: "That password is not correct." },
      { status: 401 },
    );
  }
  await grantDashboard();
  return Response.json({ ok: true });
}
