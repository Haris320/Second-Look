import { randomUUID } from "node:crypto";
import { logDecision } from "@/lib/log";
import { ReferralLoginError, safeProviderCode, type ReferralLoginCode } from "@/lib/referral-login-errors";
import { db } from "@/lib/supabase";
import { referralSession } from "@/lib/referral-auth";
import { referralsEnabled, referralScope } from "@/lib/referrals";
import { exchangeReferralIdentity, referralLoginReady } from "@/lib/whop-oauth";
import { privateHeaders } from "@/lib/order-access";
export async function GET(request:Request) {
  if (!referralsEnabled() || !referralLoginReady()) return Response.json({error:"Referral sign-in is not available yet."},{status:503,headers:privateHeaders});
  const session=await referralSession();
  const pending=session.pending;
  delete session.pending;
  await session.save();
  const url=new URL(request.url);
  const code=url.searchParams.get("code");
  const redirect=(error?:string,reference?:string)=>new Response(null,{status:303,headers:{...privateHeaders,"Referrer-Policy":"no-referrer",Location:new URL(error ? `/refer?error=${error}${reference ? `&ref=${reference}` : ""}` : "/refer",process.env.PUBLIC_BASE_URL!).href}});
  async function fail(code:ReferralLoginCode,detail="") {
    const reference=randomUUID();
    // No raw exceptions, query strings, codes, tokens, or user details go into logs.
    const reason=`reference=${reference} code=${code}${detail ? ` ${detail}` : ""}`;
    console.error("referral_login",reason);
    try { await logDecision(null,"referral_login",code,reason); } catch { /* Keep the safe browser error available if logging is down. */ }
    return redirect(code,reference);
  }
  if (url.searchParams.has("error")) {
    const provider=safeProviderCode(url.searchParams.get("error"));
    return provider==="access_denied" ? redirect("canceled") : fail("authorization",`provider=${provider}`);
  }
  if (!pending || !code || code.length>4096 || pending.state!==url.searchParams.get("state") || pending.scope!==referralScope() ||
      !Number.isFinite(pending.createdAt) || pending.createdAt>Date.now() || Date.now()-pending.createdAt>600000) return redirect("expired");
  let stage:ReferralLoginCode="failed";
  try {
    const identity=await exchangeReferralIdentity(code,pending);
    stage="profile_save";
    const {error}=await db.from("referral_profiles").upsert({scope:referralScope(),whop_user_id:identity.userId,email:identity.email.toLowerCase().trim()},
      {onConflict:"scope,whop_user_id",ignoreDuplicates:true});
    if (error) throw error;
    stage="profile_load";
    const {data:profile,error:profileError}=await db.from("referral_profiles").select("id").eq("scope",referralScope()).eq("whop_user_id",identity.userId).single();
    if (profileError || !profile) throw new Error("Referral account unavailable");
    stage="session_save";
    session.profileId=profile.id;session.scope=referralScope();session.accountLabel=identity.label;session.expiresAt=Date.now()+7*86400000;
    await session.save();
    return redirect();
  } catch(error) {
    if(error instanceof ReferralLoginError) return fail(error.code,error.detail);
    const dbCode=error && typeof error === "object" && "code" in error && typeof error.code === "string" && /^(?:[0-9A-Z]{5}|PGRST[0-9]{3})$/.test(error.code) ? `db=${error.code}` : "";
    return fail(stage,dbCode);
  }
}
