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
  const redirect=(error?:string)=>new Response(null,{status:303,headers:{...privateHeaders,"Referrer-Policy":"no-referrer",Location:new URL(error ? `/refer?error=${error}` : "/refer",process.env.PUBLIC_BASE_URL!).href}});
  if (url.searchParams.has("error")) return redirect("canceled");
  if (!pending || !code || code.length>4096 || pending.state!==url.searchParams.get("state") || pending.scope!==referralScope() ||
      !Number.isFinite(pending.createdAt) || pending.createdAt>Date.now() || Date.now()-pending.createdAt>600000) return redirect("expired");
  try {
    const identity=await exchangeReferralIdentity(code,pending);
    const {error}=await db.from("referral_profiles").upsert({scope:referralScope(),whop_user_id:identity.userId,email:identity.email.toLowerCase().trim()},
      {onConflict:"scope,whop_user_id",ignoreDuplicates:true});
    if (error) throw error;
    const {data:profile,error:profileError}=await db.from("referral_profiles").select("id").eq("scope",referralScope()).eq("whop_user_id",identity.userId).single();
    if (profileError || !profile) throw new Error("Referral account unavailable");
    session.profileId=profile.id;session.scope=referralScope();session.accountLabel=identity.label;session.expiresAt=Date.now()+7*86400000;
    await session.save();
    return redirect();
  } catch { return redirect("failed"); }
}
