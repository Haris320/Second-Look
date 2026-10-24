import { cookies } from "next/headers";
import { findReferral } from "@/lib/referrals";
import { REFERRAL_COOKIE, REFERRAL_COOKIE_AGE } from "@/lib/referral-policy";
export async function GET(request:Request,{params}:{params:Promise<{code:string}>}) {
 const {code}=await params;
 try {
   if(await findReferral(code)) (await cookies()).set(REFERRAL_COOKIE,code,{
     httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:REFERRAL_COOKIE_AGE,
   });
 } catch { return new Response("Referral links are temporarily unavailable. Please try again.",{status:503}); }
 return new Response(null,{status:303,headers:{Location:new URL("/order",process.env.PUBLIC_BASE_URL || request.url).href,"Cache-Control":"private, no-store"}});
}
