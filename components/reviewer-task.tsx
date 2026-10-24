"use client";
import { useEffect, useState } from "react";
import Image from "next/image";

type Credentials = { orderId: string; submissionId: string; token: string };
export function ReviewerTask() {
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [shots, setShots] = useState<{position: number; url: string}[]>([]);
  const [message, setMessage] = useState("Open your assigned task from Terac. Your screenshots will appear here.");
  const [busy, setBusy] = useState(false);
  const [callback, setCallback] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const c = { orderId: params.get("order") ?? "", submissionId: params.get("teracSubmissionId") ?? params.get("submissionId") ?? "", token: params.get("token") ?? "" };
    if (!c.orderId || !c.submissionId || !c.token) return;
    let cancelled = false;
    fetch("/api/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...c, action: "start" }) })
      .then(async r => { const d = await r.json(); if (!r.ok) throw Error(d.error); return d; })
      .then(d => { if (cancelled) return; setCredentials(c); setShots(d.screenshots ?? []); setCallback(d.callbackUrl ?? ""); setMessage(d.submitted ? "Your feedback is saved. Return to Terac to finish." : ""); })
      .catch(e => { if (!cancelled) setMessage(e.message); });
    return () => { cancelled = true; };
  }, []);
  return <>
    <div className="page-heading"><div><p className="eyebrow">SECOND LOOK · REVIEWER WORKSPACE</p><h1>Give a useful second look.</h1><p>Read every screenshot. Be specific, honest, and kind. Comment on choices they can change. Don’t save, share, or contact the profile owner.</p></div></div>
    {message && <p className="notice" role="status">{message}</p>}
    {callback ? <a className="button button-dark" href={callback}>Return to Terac to finish</a> : shots.length > 0 && <div className="review-layout">
      <div>{shots.map(s => <figure key={s.position}><figcaption>Screenshot {s.position}</figcaption><Image unoptimized src={s.url} alt={`Dating profile screenshot ${s.position}`} width={600} height={1000} style={{width:"100%",height:"auto"}} referrerPolicy="no-referrer" /></figure>)}<p>Images expire after ten minutes. Reload this page if they stop loading.</p></div>
      <form className="panel review-form" onSubmit={async e => {
        e.preventDefault(); setBusy(true); setMessage("");
        const data = new FormData(e.currentTarget);
        try {
          const r = await fetch("/api/review", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...credentials,action:"submit",answers:Object.fromEntries(data.entries())})});
          const d = await r.json(); if (!r.ok) throw Error(d.error);
          setCallback(d.callbackUrl); setShots([]); setMessage("Your feedback is saved. Return to Terac to finish.");
        } catch(e) { setMessage(e instanceof Error ? e.message : "Could not submit. Please retry."); }
        finally { setBusy(false); }
      }}>
        <h2>Your feedback</h2><p>Spend at least a minute reviewing. Each written answer needs at least 30 characters.</p>
        <label htmlFor="like">Would you like this profile?</label><select name="like" id="like" required defaultValue=""><option value="" disabled>Choose one</option><option value="yes">Yes</option><option value="maybe">Maybe</option><option value="no">No</option></select>
        <label htmlFor="works">What works well? Point to a specific screenshot.</label><textarea name="works" id="works" required minLength={30} maxLength={3000} />
        <label htmlFor="changes">Which photo should lead, and what should change?</label><textarea name="changes" id="changes" required minLength={30} maxLength={3000} />
        <label htmlFor="prompts">How could their bio or prompts be improved?</label><textarea name="prompts" id="prompts" required minLength={30} maxLength={3000} />
        <button className="button button-dark" disabled={busy}>{busy ? "Saving…" : "Submit feedback"}</button>
      </form>
    </div>}
  </>;
}
