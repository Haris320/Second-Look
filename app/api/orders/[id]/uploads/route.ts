// Superseded by the manifest-based POST /api/orders flow, which binds upload paths to a session.
export async function POST() {
  return Response.json(
    {
      error:
        "This upload flow has changed. Please start a new order from /order.",
    },
    { status: 410 },
  );
}
