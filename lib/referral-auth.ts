import "server-only";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { referralScope } from "./referrals";

type ReferralSession = {
  profileId?: string;
  accountLabel?: string;
  scope?: string;
  expiresAt?: number;
  pending?: { state:string; verifier:string; nonce:string; createdAt:number; scope:string };
};
export async function referralSession() {
  const password = process.env.REFERRAL_SESSION_SECRET;
  if (!password || password.length < 32) throw new Error("Referral sessions are not configured");
  return getIronSession<ReferralSession>(await cookies(), {
    password, cookieName:"sl_referrer", ttl:7*86400,
    cookieOptions:{httpOnly:true,secure:process.env.NODE_ENV === "production",sameSite:"lax",path:"/"},
  });
}
export async function currentReferrer() {
  const session = await referralSession();
  if (!session.profileId || session.scope !== referralScope() || !session.expiresAt || session.expiresAt <= Date.now()) return null;
  return {id:session.profileId,label:session.accountLabel || "Your Whop account"};
}
