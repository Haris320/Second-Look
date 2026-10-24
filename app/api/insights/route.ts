import { loadInsights } from "@/lib/marketing";

// Public. The post contains only aggregate patterns written by the agent; no customer data.
export async function GET() {
  const post = await loadInsights();
  return Response.json({ post }, { headers: { "Cache-Control": "public, max-age=300" } });
}
