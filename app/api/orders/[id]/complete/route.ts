import { hasAccess, sameOrigin } from "@/lib/order-access";
import { verifyUploads } from "@/lib/verify-uploads";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!sameOrigin(request) || !(await hasAccess(id)))
    return Response.json(
      { error: "This order is not available in this browser." },
      { status: 403 },
    );
  if (!(await verifyUploads(id)))
    return Response.json(
      {
        error:
          "Some screenshots did not finish uploading or are not valid images. Please retry the upload.",
      },
      { status: 400 },
    );
  return Response.json({ ok: true, orderId: id });
}
