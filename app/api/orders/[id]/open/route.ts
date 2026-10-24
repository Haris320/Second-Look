import { openWithKey } from "@/lib/order-links";
import { privateHeaders, sameOrigin } from "@/lib/order-access";

// Called by /order/[id]?key=… to turn a private link into this browser's access cookie.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!sameOrigin(request) || !(await openWithKey(id, body?.key)))
    return Response.json(
      { error: "This private link isn't valid for this order." },
      { status: 403, headers: privateHeaders },
    );
  return Response.json({ ok: true }, { headers: privateHeaders });
}
