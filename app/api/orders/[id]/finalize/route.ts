// Superseded by session-protected /complete and /checkout endpoints.
export async function POST() {
  return Response.json(
    {
      error:
        "This checkout flow has changed. Please return to your order page.",
    },
    { status: 410 },
  );
}
