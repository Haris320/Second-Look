// A purchaser must verify ownership before claiming an order. Email alone is not sufficient.
export async function POST() {
  return Response.json(
    {
      error:
        "Verified purchase claiming is not available yet. Please keep your Whop receipt.",
    },
    { status: 503 },
  );
}
