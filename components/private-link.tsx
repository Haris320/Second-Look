"use client";
import { useState } from "react";
import { Check, Copy, LockKeyhole } from "lucide-react";

// The order's private link, so the customer can open their results from any browser.
export function PrivateLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="panel" style={{ marginBottom: 20 }}>
      <p className="micro">
        <LockKeyhole size={12} style={{ display: "inline", verticalAlign: "middle" }} /> SAVE THIS LINK TO SEE YOUR
        RESULTS
      </p>
      <p className="caption">
        It opens this order from any browser or device. Keep it private: anyone with the link can see your order.
      </p>
      <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
        <input
          readOnly
          value={link}
          onFocus={(e) => e.target.select()}
          aria-label="Your private order link"
          style={{ flex: "1 1 240px", minWidth: 0 }}
        />
        <button className="button button-outline" onClick={() => void copy()}>
          {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
}
