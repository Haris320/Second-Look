"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, Copy, LoaderCircle } from "lucide-react";
import type { InsightsPost } from "@/lib/marketing";

export function InsightsPostView() {
  const [post, setPost] = useState<InsightsPost | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    fetch("/api/insights", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setPost(j.post ?? null))
      .catch(() => setPost(null));
  }, []);
  if (post === undefined)
    return (
      <div className="loading-panel">
        <LoaderCircle className="spin" size={20} /> Loading…
      </div>
    );
  if (!post)
    return (
      <div className="panel">
        <h2>Nothing published yet.</h2>
        <p>The agent writes this page from real reviews once enough have come in. Check back soon.</p>
      </div>
    );
  const published = new Date(post.published_at);
  return (
    <>
      <p className="micro">
        WRITTEN BY OUR AGENT FROM {post.review_count} REAL REVIEWS · UPDATED{" "}
        {published.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
      </p>
      <h1 style={{ fontSize: "clamp(34px, 6vw, 56px)", lineHeight: 1.08, margin: "16px 0" }}>{post.title}</h1>
      <p className="editorial-intro" style={{ marginBottom: 12 }}>{post.intro}</p>
      <p className="caption" style={{ marginBottom: 32 }}>
        {Math.round(post.like_rate * 100)}% of reviewers said they would like the profile they saw. Patterns below are
        aggregate: no single profile, photo, or person is described.
      </p>
      <div className="report-grid">
        {post.patterns.map((p, i) => (
          <article className="report-card" key={i}>
            <span className="eyebrow">
              <span /> PATTERN 0{i + 1}
            </span>
            <h2>{p.heading}</h2>
            <p>{p.body}</p>
          </article>
        ))}
        <article className="report-card wide">
          <span className="eyebrow">WANT TO KNOW WHAT THEY’D SAY ABOUT YOURS?</span>
          <h2>Three real people. About an hour. $15.</h2>
          <p>Upload your profile screenshots and get honest, specific feedback from the audience you’re trying to reach.</p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 18 }}>
            <Link className="button button-dark" href="/order">
              Get reviewed <ArrowUpRight size={16} />
            </Link>
            <button
              className="button button-outline"
              onClick={() => {
                void navigator.clipboard.writeText(`${post.share_post} ${window.location.origin}/insights`);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              <Copy size={14} /> {copied ? "Copied" : "Copy a tip to share"}
            </button>
          </div>
          <p className="caption" style={{ marginTop: 14 }}>“{post.share_post}”</p>
        </article>
      </div>
    </>
  );
}
