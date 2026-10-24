import { referralSession } from "@/lib/referral-auth";
import { referralsEnabled, referralScope } from "@/lib/referrals";
import { newReferralLogin, referralAuthorizeUrl, referralLoginReady } from "@/lib/whop-oauth";
import { privateHeaders } from "@/lib/order-access";
export async function GET(request:Request) {
  if (!referralsEnabled() || !referralLoginReady()) return Response.json({error:"Referral sign-in is not available yet."},{status:503,headers:privateHeaders});
  const origin=new URL(process.env.PUBLIC_BASE_URL!).origin;
  // Start on the callback host so the browser sends the same session cookie back.
  if(new URL(request.url).origin!==origin) return new Response(null,{status:303,headers:{...privateHeaders,Location:`${origin}/api/referrals/login`}});
  const session=await referralSession();
  const pending=newReferralLogin(referralScope());
  session.pending=pending;
  await session.save();
  return new Response(null,{status:303,headers:{...privateHeaders,Location:referralAuthorizeUrl(pending)}});
}
