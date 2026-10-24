import { timingSafeEqual } from "node:crypto";
import { processFeedback } from "@/lib/feedback-quality";
export const maxDuration = 300;
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const a = Buffer.from(request.headers.get("authorization") ?? ""), b = Buffer.from(`Bearer ${secret}`);
  if (!secret || a.length !== b.length || !timingSafeEqual(a,b)) return Response.json({error:"Unauthorized"},{status:401});
  let body;
  try { body=await request.json(); } catch { return Response.json({error:"Invalid JSON"},{status:400}); }
  if (typeof body?.submissionId !== "string" || !/^[a-zA-Z0-9_-]{1,200}$/.test(body.submissionId)) return Response.json({error:"Invalid submission"},{status:400});
  try { return Response.json(await processFeedback(body.submissionId)); }
  catch { return Response.json({error:"Feedback processing needs retry"},{status:503}); }
}
