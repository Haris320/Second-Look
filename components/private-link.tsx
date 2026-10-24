"use client";
import { useState } from "react";
import { Check, Copy, LockKeyhole } from "lucide-react";

// The order's private link, so the customer can open their results from any browser. Shown first on the page.
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
    <section
      aria-label="Your private results link"
      style={{
        background: "var(--sage)",
        border: "2px solid var(--coral)",
        borderRadius: 12,
        padding: "22px 24px",
        marginBottom: 28,
      }}
    >
      <h2 style={{ fontSize: 22, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
        <LockKeyhole size={20} /> Save this link to see your results
      </h2>
      <p style={{ marginTop: 8, fontSize: 14 }}>
        Bookmark it or copy it somewhere safe. It opens your results from any browser or device.
      </p>
      <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
        <input
          readOnly
          value={link}
          onFocus={(e) => e.target.select()}
          aria-label="Your private order link"
          style={{ flex: "1 1 260px", minWidth: 0, fontSize: 14, padding: "12px 14px", background: "white" }}
        />
        <button className="button button-coral" onClick={() => void copy()}>
          {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "Copied" : "Copy link"}
        </button>
      </div>
      <p style={{ marginTop: 10, fontSize: 13 }}>
        This link is private. Anyone with it can see your results, so don’t share it.
      </p>
    </section>
  );
}
