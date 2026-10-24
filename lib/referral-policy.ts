export const REFERRAL_CENTS = 300;
export const REFERRAL_COOKIE = "sl_referral";
export const REFERRAL_COOKIE_AGE = 30 * 24 * 60 * 60;
export const validReferralCode = (code: string) => /^[a-f0-9]{32}$/.test(code);

type PaymentEvidence = {
 status: string; substatus: string; account_id: string | null;
 refunded_amount?: { amount: string } | null; refunded_at?: string | null;
 auto_refunded?: boolean; dispute_alerted_at?: string | null;
 holds?: unknown[]; settlement_time_at?: string | null;
};
export function referralPaymentSafe(payment: PaymentEvidence, business: string, now = Date.now()) {
 return !!business && payment.account_id === business && payment.status === "paid" &&
   payment.substatus === "succeeded" && !payment.refunded_at && !payment.auto_refunded &&
   Number(payment.refunded_amount?.amount ?? "0") === 0 && !payment.dispute_alerted_at &&
   !payment.holds?.length && (!payment.settlement_time_at || Date.parse(payment.settlement_time_at) <= now);
}
