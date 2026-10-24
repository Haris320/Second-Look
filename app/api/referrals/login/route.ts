import { referralSession } from "@/lib/referral-auth";
import { referralsEnabled, referralScope } from "@/lib/referrals";
import { newReferralLogin, referralAuthorizeUrl, referralLoginReady } from "@/lib/whop-oauth";
import { privateHeaders } from "@/lib/order-access";
export async function GET() {
  if (!referralsEnabled() || !referralLoginReady()) return Response.json({error:"Referral sign-in is not available yet."},{status:503,headers:privateHeaders});
  const session=await referralSession();
  const pending=newReferralLogin(referralScope());
  session.pending=pending;
  await session.save();
  return new Response(null,{status:303,headers:{...privateHeaders,Location:referralAuthorizeUrl(pending)}});
}
