"use client";
import { useState } from "react";
export type ReferralSummary={link:string;pendingCents:number;paidCents:number;attention:number};
export function ReferralPanel({referral}:{referral:ReferralSummary}) {
 const [copied,setCopied]=useState(false);
 const [error,setError]=useState(false);
 async function copy() {
   try { await navigator.clipboard.writeText(referral.link);setCopied(true);setError(false); }
   catch { setError(true); }
 }
 return <section className="panel" style={{marginBottom:20}} aria-label="Refer a friend">
   <p className="micro">GOOD ADVICE IS WORTH SHARING</p>
   <h2 style={{fontSize:24,margin:"8px 0"}}>Give a friend a second look. Get $3.</h2>
   <p className="caption">They pay the usual price: $15 for one reviewer or $40 for three. You get $3 for their first qualifying purchase.</p>
   <p className="caption" style={{marginTop:10}}><strong>A Whop account is required.</strong> Your referral rewards go to the Whop account used for your purchase.</p>
   <div style={{display:"flex",gap:10,marginTop:14,flexWrap:"wrap"}}>
     <input readOnly value={referral.link} onFocus={e=>e.target.select()} aria-label="Your public referral link" style={{flex:"1 1 240px",minWidth:0}} />
     <button className="button button-outline" onClick={()=>void copy()}>{copied ? "Copied!" : "Copy referral link"}</button>
   </div>
   {error && <p role="status" className="caption">Select the link above and copy it manually.</p>}
   <p style={{marginTop:16}}><strong>${(referral.pendingCents/100).toFixed(2)}</strong> pending · <strong>${(referral.paidCents/100).toFixed(2)}</strong> paid to your Whop balance</p>
   <p className="caption">Friends must open your link before creating their order, within 30 days. Rewards have a 30-day hold and are paid after the order passes screening. Refunded or disputed purchases and self-referrals don’t qualify. This link is safe to share; it contains no profile photos.</p>
   {referral.attention>0 && <p className="caption">{referral.attention} reward(s) need a payout or refund check.</p>}
 </section>;
}
