import { timingSafeEqual } from "node:crypto";
import { previewMarketingPost, runMarketingPost } from "@/lib/x-marketing";
export const maxDuration = 180;
function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return !!secret && actual.length === expected.length && timingSafeEqual(actual, expected);
}
// GET is the scheduled worker. POST is a protected, non-publishing preview.
export async function GET(request: Request) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  try {
    const result = await runMarketingPost();
    return Response.json(result, { status: "failed" in result ? 503 : 200, headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Marketing configuration or service unavailable" }, { status: 503 });
  }
}
export async function POST(request: Request) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  try {
    return Response.json(await previewMarketingPost(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Preview failed; check migration and Anthropic configuration" }, { status: 503 });
  }
}
