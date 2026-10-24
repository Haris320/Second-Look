import "server-only";
import { cookies } from "next/headers";
import { db } from "./supabase";
import { whop, whopBizId, toCents } from "./whop";
import { expectedOrderCents } from "./tiers";
import { REFERRAL_COOKIE, validReferralCode } from "./referral-policy";

export const referralsEnabled = () => process.env.REFERRALS_ENABLED === "true";
export function referralScope() {
 if (!whopBizId) throw new Error("Whop business is not configured");
 return `${process.env.WHOP_ENVIRONMENT === "sandbox" ? "sandbox" : "production"}:${whopBizId}`;
}
export async function findReferral(code: string) {
 if (!referralsEnabled() || !validReferralCode(code)) return null;
 const { data, error } = await db.from("referral_profiles").select("id").eq("scope", referralScope()).eq("code", code).maybeSingle();
 if (error) throw error;
 return data?.id ?? null;
}
export async function attributedReferrer() {
 if (!referralsEnabled()) return null;
 return findReferral((await cookies()).get(REFERRAL_COOKIE)?.value ?? "");
}

// Called on every verified payment delivery, including duplicate webhooks.
export async function recordReferralPurchase(payment: Awaited<ReturnType<typeof whop.payments.retrieve>>, orderId: string) {
 if (!referralsEnabled()) return;
 if (payment.account_id !== whopBizId || payment.status !== "paid") throw new Error("Referral payment account/status mismatch");
 const { data: order, error } = await db.from("orders").select("tier,review_target,whop_payment_id").eq("id", orderId).single();
 if (error || !order) throw new Error("Referral order unavailable");
 if (order.whop_payment_id !== payment.id || expectedOrderCents(order.tier,order.review_target) !== toCents(payment.usd_total?.amount ?? payment.total?.amount)) throw new Error("Referral payment does not match order");
 // Missing provider identity/email is not safe to reward. Retry so permission fixes can recover it.
 if (!payment.user?.id || !payment.customer_email) throw new Error("Whop buyer identity/email permission required for referrals");
 const { error: saveError } = await db.rpc("record_referral_purchase", {
   p_scope: referralScope(), p_order: orderId, p_payment: payment.id,
   p_buyer: payment.user.id, p_email: payment.customer_email,
 });
 if (saveError) throw saveError;
 // A delayed succeeded event may arrive after a refund event. Use current provider state.
 if (payment.substatus !== "succeeded" || payment.refunded_at || payment.auto_refunded || Number(payment.refunded_amount?.amount ?? 0)>0 || payment.dispute_alerted_at) {
   const {error: invalidateError}=await db.rpc("invalidate_referral_reward",{p_scope:referralScope(),p_payment:payment.id,p_reason:"Payment refunded or disputed before referral recording"});
   if(invalidateError) throw invalidateError;
 }
}

export async function referralSummary(orderId: string) {
 if (!referralsEnabled()) return null;
 const { data: order, error: orderError } = await db.from("orders").select("buyer_whop_user_id").eq("id", orderId).single();
 if (orderError) throw orderError;
 if (!order?.buyer_whop_user_id) return null;
 const { data: profile, error } = await db.from("referral_profiles").select("id,code").eq("scope", referralScope()).eq("whop_user_id", order.buyer_whop_user_id).maybeSingle();
 if (error) throw error;
 if (!profile) return null;
 return profileReferralSummary(profile.id);
}

export async function profileReferralSummary(profileId:string) {
 if (!referralsEnabled()) return null;
 const {data:profile,error}=await db.from("referral_profiles").select("id,code").eq("id",profileId).eq("scope",referralScope()).maybeSingle();
 if(error) throw error;
 if(!profile) return null;
 // Count in the database, without exposing friends' identities or truncating at the API row limit.
 const counts = await Promise.all(["pending", "paid", "attention"].map(async group => {
   const states = group === "pending" ? ["pending","transferring"] : group === "paid" ? ["paid"] : ["needs_attention","recovery_needed"];
   const { count, error } = await db.from("referral_rewards").select("id", { count:"exact",head:true }).eq("profile_id",profile.id).in("state",states);
   if (error) throw error;
   return count ?? 0;
 }));
 return { link: `${process.env.PUBLIC_BASE_URL}/r/${profile.code}`, pendingCents: counts[0]*300, paidCents: counts[1]*300, attention: counts[2] };
}
