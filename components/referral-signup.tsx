"use client";
import { useEffect, useState, useCallback } from "react";
import { referralLoginMessage } from "@/lib/referral-login-errors";
import { ReferralPanel, type ReferralSummary } from "./referral-panel";
type Account={ready:boolean;referral:ReferralSummary|null;accountLabel?:string};
export function ReferralSignup() {
  const [account,setAccount]=useState<Account|null>(null);
  const [error,setError]=useState("");
  const [loginError,setLoginError]=useState("");
  const load=useCallback(async()=>{
    try {
      const response=await fetch("/api/referrals/me",{cache:"no-store"});
      const data=await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load your referral account.");
      setAccount(data);setError("");
    } catch(e) {setError(e instanceof Error ? e.message : "Please try again.");}
  },[]);
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    const result=params.get("error");
    const reference=params.get("ref");
    // OAuth errors are mapped to fixed messages, never reflected from provider query parameters.
    if(result) {
      window.history.replaceState(null,"","/refer");
      queueMicrotask(()=>setLoginError(`${referralLoginMessage(result)}${reference && /^[0-9a-f-]{36}$/.test(reference) ? ` Reference: ${reference}` : ""}`));
    }
    void Promise.resolve().then(load);
  },[load]);
  if(error) return <div className="panel"><p role="alert">{error}</p><button className="button button-outline" onClick={()=>void load()}>Try again</button></div>;
  if(!account) return <div className="panel" role="status">Loading referral sign-in…</div>;
  if(account.referral) return <>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,flexWrap:"wrap",marginBottom:20}}>
      <p className="caption">Connected to Whop: <strong>{account.accountLabel}</strong></p>
      <form action="/api/referrals/logout" method="POST"><button className="button button-outline" type="submit">Sign out</button></form>
    </div>
    <ReferralPanel referral={account.referral}/>
    <button className="text-link" onClick={()=>void load()}>Refresh earnings</button>
  </>;
  return <div className="panel">
    <h2 style={{fontSize:24,marginBottom:12}}>Start with your Whop account.</h2>
    <p className="caption">Sign in or create a free Whop account, then get your personal referral link. No review purchase needed.</p>
    {loginError && <p role="alert" style={{marginTop:12}}>{loginError}</p>}
    {account.ready ? <a className="button button-dark" style={{marginTop:20}} href="/api/referrals/login">Continue with Whop →</a>
      : <p role="status" style={{marginTop:20}}>Referral sign-up is coming soon. Please check back shortly.</p>}
    <p className="caption" style={{marginTop:16}}>We use Whop to verify who receives the reward. Your referral account won’t give you access to anyone else’s photos or results.</p>
  </div>;
}
