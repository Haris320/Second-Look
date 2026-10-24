import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "./supabase";
import { whop, whopBizId, toCents } from "./whop";
import { referralScope, referralsEnabled } from "./referrals";
import { referralPaymentSafe, REFERRAL_CENTS } from "./referral-policy";
import { expectedOrderCents } from "./tiers";

const WHOP_REQUEST = {timeoutInSeconds:20,maxRetries:0};

type Reward = { id:string; scope:string; profile_id:string; payment_id:string; buyer_id:string; order_id:string; state:string; transfer_id:string|null; invalidated_at:string|null };
async function checked(result: PromiseLike<{error: unknown}>) {
 const {error} = await result;
 if (error) throw error;
}
export async function invalidateReferral(paymentId:string, reason:string) {
 await checked(db.rpc("invalidate_referral_reward", {p_scope:referralScope(),p_payment:paymentId,p_reason:reason}));
}
async function reconcileTransfer(id:string) {
 const transfer = await whop.transfers.retrieve({id},WHOP_REQUEST);
 const rewardId = transfer.metadata?.referral_reward_id;
 if (typeof rewardId !== "string") return;
 const {data:reward,error} = await db.from("referral_rewards").select("*").eq("id",rewardId).eq("scope",referralScope()).maybeSingle();
 if (error) throw error;
 if (!reward) return;
 const {data:profile,error:profileError} = await db.from("referral_profiles").select("whop_user_id").eq("id",reward.profile_id).single();
 if (profileError || !profile) throw new Error("Referral recipient unavailable");
 if (transfer.origin?.id !== whopBizId || transfer.destination?.id !== profile.whop_user_id ||
     (transfer.status === "succeeded" && (transfer.amount?.currency !== "usd" || toCents(transfer.amount.amount) !== REFERRAL_CENTS))) {
   throw new Error("Referral transfer evidence mismatch");
 }
 await checked(db.rpc("finish_referral_transfer",{p_id:reward.id,p_transfer:id,p_status:transfer.status}));
}
export async function handleReferralEvent(name:string,id:string) {
 if (!referralsEnabled()) return false;
 if (["transfer.created","transfer.completed","transfer.failed"].includes(name)) {
   await reconcileTransfer(id); return true;
 }
 if (name.startsWith("refund.")) {
   const refund = await whop.refunds.retrieve({id},WHOP_REQUEST);
   if (!["failed","canceled"].includes(refund.status)) await invalidateReferral(refund.payment_id,"Payment refund reported by Whop");
   return true;
 }
 if (name.startsWith("dispute.")) {
   const dispute = await whop.disputes.retrieve({id},WHOP_REQUEST);
   await invalidateReferral(dispute.payment.id,"Payment dispute reported by Whop");
   return true;
 }
 return false;
}

export async function payReferral(id:string) {
 const token=randomUUID();
 const {data,error}=await db.rpc("claim_referral_reward",{p_id:id,p_scope:referralScope(),p_token:token});
 if(error) throw error;
 if(!data) return;
 const reward=data as Reward;
 try {
   if(reward.transfer_id) { await reconcileTransfer(reward.transfer_id); return; }
   const payment=await whop.payments.retrieve({id:reward.payment_id},WHOP_REQUEST);
   const {data:order,error:orderError}=await db.from("orders").select("status,tier,review_target,whop_payment_id").eq("id",reward.order_id).single();
   const {data:profile,error:profileError}=await db.from("referral_profiles").select("whop_user_id").eq("id",reward.profile_id).eq("scope",referralScope()).single();
   if(orderError || profileError || !order || !profile) throw new Error("Referral payout evidence unavailable");
   if(payment.user?.id!==reward.buyer_id || order.whop_payment_id!==payment.id || payment.account_id!==whopBizId ||
      expectedOrderCents(order.tier,order.review_target)!==toCents(payment.usd_total?.amount ?? payment.total?.amount)) {
     await invalidateReferral(payment.id,"Payment identity or amount mismatch"); return;
   }
   if(payment.status!=="paid" || payment.substatus!=="succeeded" || payment.refunded_at || payment.auto_refunded ||
      Number(payment.refunded_amount?.amount ?? 0)>0 || payment.dispute_alerted_at) {
     await invalidateReferral(payment.id,"Payment is refunded, disputed, or no longer successful"); return;
   }
   // Funds on hold and unfinished uploads defer payout, rather than forfeiting the reward.
   if(!referralPaymentSafe(payment,whopBizId) || !["paid","in_review","done"].includes(order.status)) return;
   // Persist intent before the financial API call. A refund racing with us prevents this claim.
   const {data:started,error:startError}=await db.from("referral_rewards").update({state:"transferring"})
     .eq("id",id).eq("lease_token",token).is("invalidated_at",null).select("id");
   if(startError) throw startError;
   if(!started?.length) return;
   const transfer=await whop.transfers.create({
     type:"balance",origin_id:whopBizId,destination_id:profile.whop_user_id,
     amount:REFERRAL_CENTS/100,currency:"usd",idempotence_key:`second-look-referral-${id}`,
     metadata:{referral_reward_id:id},notes:"Second Look referral reward",
   },WHOP_REQUEST);
   if(transfer.object!=="transfer") throw new Error("Expected a balance transfer");
   // Save the ID even if a refund arrived while the transfer was being created.
   await checked(db.from("referral_rewards").update({transfer_id:transfer.id}).eq("id",id));
   await reconcileTransfer(transfer.id);
 } catch(error) {
   await checked(db.from("referral_rewards").update({last_error:"Payout could not be reconciled. Retry uses the same transfer key."}).eq("id",id).eq("lease_token",token));
   throw error;
 } finally {
   await checked(db.from("referral_rewards").update({lease_token:null,lease_until:null,next_attempt_at:new Date(Date.now()+25*3600000).toISOString()}).eq("id",id).eq("lease_token",token));
 }
}
export async function runReferralPayouts() {
 if(!referralsEnabled() || process.env.REFERRAL_PAYOUTS_ENABLED!=="true") return {disabled:true};
 const {data,error}=await db.from("referral_rewards").select("id,state,transfer_id").eq("scope",referralScope())
   .in("state",["pending","transferring","needs_attention","recovery_needed"])
   .lte("available_at",new Date().toISOString()).lte("next_attempt_at",new Date().toISOString())
   .order("next_attempt_at").limit(20);
 if(error) throw error;
 const deadline=Date.now()+180000;
 let processed=0, failed=0;
 for(const reward of data ?? []) {
   if(Date.now()>deadline) break;
   try {
     if(["needs_attention","recovery_needed"].includes(reward.state)) {
       if(reward.transfer_id) await reconcileTransfer(reward.transfer_id);
       await checked(db.from("referral_rewards").update({next_attempt_at:new Date(Date.now()+7*86400000).toISOString()}).eq("id",reward.id));
     } else await payReferral(reward.id);
     processed++;
   } catch { failed++; }
 }
 return {processed,failed};
}
