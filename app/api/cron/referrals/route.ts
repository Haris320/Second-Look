import { timingSafeEqual } from "node:crypto";
import { runReferralPayouts } from "@/lib/referral-payouts";
export const maxDuration=300;
export async function GET(request:Request) {
 const secret=process.env.CRON_SECRET;
 const actual=Buffer.from(request.headers.get("authorization") ?? "");
 const expected=Buffer.from(`Bearer ${secret}`);
 if(!secret || actual.length!==expected.length || !timingSafeEqual(actual,expected)) return new Response("Unauthorized",{status:401});
 const result=await runReferralPayouts();
 return Response.json(result,{status:result.failed ? 503 : 200,headers:{"Cache-Control":"no-store"}});
}
