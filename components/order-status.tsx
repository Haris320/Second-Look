"use client";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowUpRight,
  Check,
  CheckCheck,
  Clock3,
  ImagePlus,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  Trash2,
  AlertCircle,
} from "lucide-react";
import { audienceLabel } from "@/lib/audience";
import { TIERS, expectedOrderCents, type Tier } from "@/lib/tiers";
import type { FirstRead } from "@/lib/first-read";
import { ReportContent, type ProfileReport } from "./report-content";
import { ReuploadForm } from "./reupload-form";
import { PrivateLink } from "./private-link";
type OrderData = {
  order: {
    id: string;
    audience: string;
    tier: Tier;
    amount_cents: number | null;
    review_target: number;
    reviews_done: number;
    status: string;
    report_json: ProfileReport | null;
    first_read_json: FirstRead | null;
  };
  screenshots: { id: string; position: number; url: string | null }[];
  checkoutReady: boolean;
  privateLink: string | null;
};
export function OrderStatus({ id }: { id: string }) {
  const [data, setData] = useState<OrderData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/orders/${id}`, { cache: "no-store" });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "Unable to load your order.");
      setData(json);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load your order.");
    }
  }, [id]);
  // Fetch completion updates state asynchronously; this effect subscribes to external data.
  useEffect(() => {
    // A private link (?key=…) first gives this browser access, then the key leaves the address bar.
    const key = new URLSearchParams(window.location.search).get("key");
    const opening = key
      ? fetch(`/api/orders/${id}/open`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key }),
        })
          .then(() => window.history.replaceState(null, "", `/order/${id}`))
          .catch(() => {})
      : Promise.resolve();
    void opening.then(load);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30000);
    return () => clearInterval(timer);
  }, [id, load]);
  async function checkout() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/orders/${id}/checkout`, { method: "POST" });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      if (!result.url || new URL(result.url).protocol !== "https:")
        throw new Error("Checkout could not open. Please retry.");
      window.location.assign(result.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open checkout.");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    try {
      const r = await fetch(`/api/orders/${id}`, { method: "DELETE" });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error);
      setDeleted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove your draft.");
    } finally {
      setBusy(false);
    }
  }
  if (deleted)
    return (
      <div className="general-error">
        <h1>Draft deleted.</h1>
        <p>Your screenshots and unpaid order have been removed.</p>
        <Link className="button button-dark" href="/order">
          Start a new review <ArrowUpRight size={17} />
        </Link>
      </div>
    );
  if (!data)
    return error ? (
      <div className="general-error">
        <LockKeyhole size={35} style={{ margin: "0 auto 20px" }} />
        <h1>Your profile is private.</h1>
        <p>{error}</p>
        <button className="button button-outline" onClick={() => void load()}>
          <RefreshCw size={15} /> Try again
        </button>
      </div>
    ) : (
      <div className="loading-panel">
        <LoaderCircle className="spin" size={20} /> Loading your second look…
      </div>
    );
  const { order, screenshots } = data;
  const paid = order.status !== "pending_payment";
  const done = order.status === "done";
  const held = order.status === "held";
  const reupload = order.status === "needs_reupload";
  const firstRead = order.first_read_json;
  const savedCount = screenshots.filter((s) => s.url).length;
  const allSaved = screenshots.length > 0 && savedCount === screenshots.length;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR SECOND LOOK</p>
          <h1>
            {done ? (
              <>
                A fresh <em>perspective.</em>
              </>
            ) : paid ? (
              <>
                Good things take
                <br />
                <em>a second look.</em>
              </>
            ) : (
              <>
                Your profile is saved.
                <br />
                <em>Next, your second look.</em>
              </>
            )}
          </h1>
          <p>
            {done
              ? "Your reviewers have weighed in. Here’s what they noticed."
              : paid
                ? "Follow your review here. This page checks for new feedback automatically."
                : "Your screenshots are private. Complete checkout to send your profile for review."}
          </p>
        </div>
        <button
          className="button button-outline refresh-button"
          onClick={() => void load()}
        >
          <RefreshCw size={14} /> Refresh status
        </button>
      </div>
      {error && (
        <div className="error-message" role="alert">
          <AlertCircle size={16} />
          {error}
        </div>
      )}
      {data.privateLink && <PrivateLink link={data.privateLink} />}
      <div className="status-layout">
        <div className="panel">
          <div className="status-icon">
            {done ? (
              <CheckCheck size={27} />
            ) : paid ? (
              <Clock3 size={27} />
            ) : (
              <ImagePlus size={27} />
            )}
          </div>
          <h2>
            {done
              ? "Your review is ready"
              : paid
                ? `${order.reviews_done} of ${order.review_target} reviews received`
                : `${savedCount} of ${screenshots.length} screenshots saved`}
          </h2>
          <p>
            {done
              ? "Every perspective comes from an independent human reviewer."
              : reupload
                ? "These screenshots don’t look like a dating profile, so we haven’t sent them to reviewers. Upload screenshots of your profile’s photos and prompts, and we’ll check them again right away."
                : held
                  ? "We need a closer look at your screenshots before they go to reviewers. They should show your own dating profile, with nothing explicit. If we can’t go ahead, we’ll refund you."
                  : paid
                    ? "Every perspective comes from an independent human reviewer. Your results arrive by tonight."
                    : "You haven’t been charged. Review your details before heading to Whop."}
          </p>
          {reupload && <ReuploadForm id={id} onDone={() => void load()} />}
          <ol className="status-timeline">
            {[
              {
                title: "Profile uploaded",
                description: allSaved
                  ? "Stored privately, ready for a second look"
                  : "Some files are missing. Return to the uploader to retry, or delete this draft.",
                complete: allSaved,
              },
              {
                title: "Payment confirmed",
                description: "Secure one-time payment through Whop",
                complete: paid,
              },
              {
                title: "Human reviews",
                description: `${order.reviews_done} of ${order.review_target} perspectives received`,
                complete: done,
              },
              {
                title: "Your results",
                description: done
                  ? "Your report is ready below"
                  : "A clear list of what to keep and what to improve",
                complete: done,
              },
            ].map((s, i) => (
              <li
                key={s.title}
                className={
                  s.complete
                    ? "done"
                    : (paid ? i === 2 : i === 1)
                      ? "current"
                      : ""
                }
              >
                <i>{s.complete ? <Check size={15} /> : i + 1}</i>
                <div>
                  <strong>{s.title}</strong>
                  <span>{s.description}</span>
                </div>
              </li>
            ))}
          </ol>
          {screenshots.length > 0 && (
            <>
              <p className="micro">YOUR UPLOADED SCREENSHOTS</p>
              <div className="saved-images">
                {screenshots.map((s) =>
                  s.url ? (
                    <Image
                      key={s.id}
                      src={s.url}
                      width={62}
                      height={85}
                      unoptimized
                      alt={`Saved screenshot ${s.position}`}
                    />
                  ) : null,
                )}
              </div>
            </>
          )}
        </div>
        <aside className="panel status-aside">
          <span className="mini-tag">ORDER SUMMARY</span>
          <dl className="order-details">
            <div>
              <dt>Review</dt>
              <dd>{TIERS[order.tier]?.name ?? order.tier}</dd>
            </div>
            <div>
              <dt>Reviewers</dt>
              <dd>{order.review_target} {order.review_target === 1 ? "person" : "people"}</dd>
            </div>
            <div>
              <dt>Audience</dt>
              <dd>{audienceLabel(order.audience)}</dd>
            </div>
            <div>
              <dt>Screenshots</dt>
              <dd>{screenshots.length}</dd>
            </div>
            <div>
              <dt>Total</dt>
              <dd>
                {order.amount_cents !== null
                  ? `$${(order.amount_cents / 100).toFixed(2)}`
                  : expectedOrderCents(order.tier, order.review_target) !== null
                    ? `$${expectedOrderCents(order.tier, order.review_target)! / 100}`
                    : "Previous offer"}
              </dd>
            </div>
          </dl>
          {!paid && (
            <>
              <button
                className="button button-coral"
                disabled={busy || !data.checkoutReady || !allSaved}
                onClick={() => void checkout()}
              >
                {busy ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <LockKeyhole size={15} />
                )}{" "}
                Continue to Whop
              </button>
              {!data.checkoutReady && (
                <p className="caption">
                  Checkout isn’t open yet. Your screenshots are saved, but
                  review will only start after payment is connected and
                  confirmed.
                </p>
              )}
              <button
                className="subtle-button"
                onClick={() => setDeleting(!deleting)}
              >
                <Trash2 size={13} /> Delete this unpaid draft
              </button>
              {deleting && (
                <div className="error-message">
                  <div>
                    Delete this order and all its screenshots?
                    <div style={{ display: "flex", gap: 15, marginTop: 10 }}>
                      <button
                        className="text-link"
                        disabled={busy}
                        onClick={() => void remove()}
                      >
                        Yes, delete
                      </button>
                      <button
                        className="text-link"
                        onClick={() => setDeleting(false)}
                      >
                        Keep draft
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          <p className="caption">
            <LockKeyhole
              size={12}
              style={{ display: "inline", verticalAlign: "middle" }}
            />{" "}
            Open this page in the same browser to access your private order.
          </p>
          <p className="caption">Order {order.id.slice(0, 8)}</p>
        </aside>
      </div>
      {paid && !done && firstRead && (
        <section className="dashboard-section">
          <div className="report-grid">
            <article className="report-card wide">
              <span className="eyebrow">AI FIRST READ · NOT FROM A HUMAN REVIEWER</span>
              <h2>While your reviewers get to work.</h2>
              <p>{firstRead.first_impression}</p>
              {firstRead.lead_photo > 0 && (
                <p>Lead with screenshot {firstRead.lead_photo}.</p>
              )}
              {!!firstRead.working.length && (
                <ul>
                  {firstRead.working.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              )}
              <ol className="fix-list">
                {firstRead.tips.map((tip, i) => (
                  <li key={tip}>
                    <b>0{i + 1}</b>
                    <p>{tip}</p>
                  </li>
                ))}
              </ol>
              <p className="caption">
                Written by AI from your screenshots before any person saw them.
                Your report from real reviewers replaces this.
              </p>
            </article>
          </div>
        </section>
      )}
      {done && order.report_json && (
        <section className="dashboard-section">
          <ReportContent report={order.report_json} />
        </section>
      )}
    </>
  );
}
