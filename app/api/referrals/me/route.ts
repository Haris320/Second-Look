import { connection } from "next/server";
import { currentReferrer } from "@/lib/referral-auth";
import { referralsEnabled, profileReferralSummary } from "@/lib/referrals";
import { referralLoginReady } from "@/lib/whop-oauth";
import { privateHeaders } from "@/lib/order-access";
export async function GET() {
  // Keep this private account endpoint request-time even when sign-in is disabled at build time.
  await connection();
  const ready=referralsEnabled() && referralLoginReady();
  if (!ready) return Response.json({ready:false,referral:null},{headers:privateHeaders});
  try {
    const referrer=await currentReferrer();
    if (!referrer) return Response.json({ready:true,referral:null},{headers:privateHeaders});
    const referral=await profileReferralSummary(referrer.id);
    return Response.json({ready:true,referral,accountLabel:referrer.label},{headers:privateHeaders});
  } catch { return Response.json({error:"Could not load your referral account. Please try again."},{status:503,headers:privateHeaders}); }
}
