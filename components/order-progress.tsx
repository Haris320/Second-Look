import Link from "next/link";
import { Check } from "lucide-react";
import { TIERS } from "@/lib/tiers";

// The five steps every paid order moves through, with the current one highlighted, and one line on what's next.
export function OrderProgress({ status, done: reviewsDone, target }: { status: string; done: number; target: number }) {
  const step =
    status === "pending_payment" ? 0
    : status === "screening" || status === "needs_reupload" || status === "held" ? 1
    : status === "done" ? 4
    : reviewsDone > 0 ? 3
    : 2;
  const steps = ["Paid", "AI first read", "Finding reviewers", `Reviews in (${reviewsDone} of ${target})`, "Report ready"];
  const whop = "Your results also arrive as a Whop message.";
  const next = [
    "Next: complete checkout on Whop, and your review starts right away.",
    status === "needs_reupload"
      ? "Next: upload screenshots of your dating profile below, and we’ll check them again right away."
      : status === "held"
        ? "Next: we’re taking a closer look at your screenshots before they go to reviewers."
        : `Next: our AI checks your screenshots (about a minute), then real people review your profile. ${whop}`,
    `Next: we’re matching you with reviewers in your audience. Results arrive by tonight. ${whop}`,
    `Next: the rest of your reviewers are on it. Results arrive by tonight. ${whop}`,
    "Your report is below. We sent the link to you as a Whop message too.",
  ][step];
  return (
    <section aria-label="Order progress" style={{ marginBottom: 28 }}>
      <ol style={{ display: "flex", flexWrap: "wrap", gap: 8, listStyle: "none", padding: 0, margin: 0 }}>
        {steps.map((label, i) => (
          <li
            key={label}
            aria-current={i === step ? "step" : undefined}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 12px",
              borderRadius: 999,
              fontSize: 13,
              fontWeight: i === step ? 600 : 400,
              background: i === step ? "var(--coral)" : i < step ? "var(--sage)" : "white",
              color: i === step ? "white" : i < step ? "var(--ink)" : "var(--muted)",
              border: `1px solid ${i === step ? "var(--coral)" : "var(--line)"}`,
            }}
          >
            {i < step || (i === 4 && step === 4) ? <Check size={13} /> : <span>{i + 1}</span>}
            {label}
          </li>
        ))}
      </ol>
      <p style={{ marginTop: 12, fontSize: 14 }}>{next}</p>
    </section>
  );
}

// Shown under a finished report: a fresh three-reviewer order for the same audience, at the usual price.
export function MoreOpinions({ audience }: { audience: string }) {
  const { reviews, priceUsd } = TIERS.full;
  return (
    <section className="panel" style={{ marginTop: 24, textAlign: "center" }}>
      <h2>Want more opinions?</h2>
      <p style={{ fontSize: 14 }}>
        Get {reviews} more reviewers for ${priceUsd}. Same audience, fresh eyes.
      </p>
      <Link
        href={`/order?tier=full&audience=${encodeURIComponent(audience)}`}
        className="button button-coral"
        style={{ marginTop: 14, display: "inline-flex" }}
      >
        Get {reviews} more reviewers
      </Link>
    </section>
  );
}
