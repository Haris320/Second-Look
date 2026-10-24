"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AUDIENCES, TIERS, type Audience, type Tier } from "@/lib/tiers";

// Shape proposed in checklist.md; partner's report code writes it.
type Report = {
  review_count: number;
  like: { yes: number; maybe: number; no: number };
  photos: { position: number; avg_score: number }[];
  lead_photo: number | null;
  cut_photo: number | null;
  prompts: {
    works?: { summary: string; quotes: string[] };
    falls_flat?: { summary: string; quotes: string[] };
  };
  come_across: { word: string; count: number }[];
  top_fixes: { fix: string; mentions: number }[];
  ai_rewrites: { prompt: string; rewrite: string }[];
};

type Order = {
  audience: Audience | null;
  tier: Tier;
  status: "pending_payment" | "awaiting_upload" | "paid" | "in_review" | "done";
  review_target: number;
  reviews_done: number;
  report_json: Report | null;
};

export function OrderStatus() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      const res = await fetch(`/api/orders/${id}`, { cache: "no-store" });
      if (res.status === 404) return setMissing(true);
      const data: Order = await res.json();
      setOrder(data);
      if (data.status !== "done") timer = setTimeout(load, 10_000);
    }
    load();
    return () => clearTimeout(timer);
  }, [id]);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12">
      <Link href="/" className="text-sm text-neutral-500">← Second Look</Link>
      {missing && <p className="mt-8">We couldn&apos;t find that order. Check the link in your email.</p>}
      {!missing && !order && <p className="mt-8 text-neutral-500">Loading…</p>}
      {order && (
        <>
          <h1 className="mt-4 text-3xl font-semibold">Your {TIERS[order.tier].name}</h1>
          {order.audience && <p className="mt-1 text-neutral-600">Reviewed by {AUDIENCES[order.audience]}</p>}
          <p className="mt-2 text-sm text-neutral-500">Bookmark this page; it updates on its own.</p>
          {order.status === "done" && order.report_json ? <ReportView report={order.report_json} /> : <Progress order={order} />}
        </>
      )}
    </main>
  );
}

function Progress({ order }: { order: Order }) {
  if (order.status === "pending_payment") {
    return <Panel>Confirming your payment with Whop. This usually takes a few seconds.</Panel>;
  }
  if (order.status === "awaiting_upload") {
    return <Panel>We have your payment. <Link href="/start" className="underline">Upload your screenshots</Link> to get started.</Panel>;
  }
  const pct = Math.round((order.reviews_done / order.review_target) * 100);
  return (
    <Panel>
      <p className="text-lg font-medium">
        {order.reviews_done} of {order.review_target} reviews in
      </p>
      <div className="mt-3 h-2 rounded-full bg-neutral-200">
        <div className="h-2 rounded-full bg-neutral-900 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-3 text-sm text-neutral-500">
        Real people are reviewing your profile now. Your report appears here when the last review is in.
      </p>
    </Panel>
  );
}

function ReportView({ report }: { report: Report }) {
  const photos = [...report.photos].sort((a, b) => b.avg_score - a.avg_score);
  return (
    <div className="mt-8 space-y-6">
      <Panel>
        <p className="text-4xl font-semibold">
          {report.like.yes} of {report.review_count}
        </p>
        <p className="mt-1 text-neutral-600">would like your profile ({report.like.maybe} maybe, {report.like.no} no)</p>
      </Panel>

      <Panel title="Your photos">
        {report.lead_photo && <p>Lead with <strong>photo {report.lead_photo}</strong>.</p>}
        {report.cut_photo && <p>Consider cutting <strong>photo {report.cut_photo}</strong>.</p>}
        <ol className="mt-3 space-y-1 text-sm">
          {photos.map((photo) => (
            <li key={photo.position} className="flex justify-between border-b border-neutral-100 py-1">
              <span>Photo {photo.position}</span>
              <span className="font-medium">{photo.avg_score.toFixed(1)} / 10</span>
            </li>
          ))}
        </ol>
      </Panel>

      <Panel title="Your prompts">
        {report.prompts.works && <PromptBlock label="Works" block={report.prompts.works} />}
        {report.prompts.falls_flat && <PromptBlock label="Falls flat" block={report.prompts.falls_flat} />}
      </Panel>

      {report.come_across.length > 0 && (
        <Panel title="How you come across">
          <div className="flex flex-wrap gap-2">
            {report.come_across.map(({ word, count }) => (
              <span key={word} className="rounded-full bg-neutral-100 px-3 py-1 text-sm">
                {word}{count > 1 && <span className="text-neutral-500"> ×{count}</span>}
              </span>
            ))}
          </div>
        </Panel>
      )}

      <Panel title="Top fixes">
        <ol className="list-decimal space-y-2 pl-5">
          {report.top_fixes.map(({ fix, mentions }) => (
            <li key={fix}>
              {fix} <span className="text-sm text-neutral-500">({mentions} reviewers)</span>
            </li>
          ))}
        </ol>
      </Panel>

      {report.ai_rewrites.length > 0 && (
        <Panel title="Suggested prompt rewrites">
          <p className="mb-3 text-sm text-neutral-500">AI suggestions based on your reviewers&apos; feedback, not written by reviewers.</p>
          {report.ai_rewrites.map(({ prompt, rewrite }) => (
            <div key={prompt} className="mb-3">
              <p className="text-sm text-neutral-500">{prompt}</p>
              <p>{rewrite}</p>
            </div>
          ))}
        </Panel>
      )}

      <p className="text-sm text-neutral-500">Your screenshots have been deleted now that your report is delivered.</p>
    </div>
  );
}

function PromptBlock({ label, block }: { label: string; block: { summary: string; quotes: string[] } }) {
  return (
    <div className="mb-4">
      <p className="font-medium">{label}</p>
      <p>{block.summary}</p>
      {block.quotes.map((quote) => (
        <blockquote key={quote} className="mt-1 border-l-2 border-neutral-300 pl-3 text-sm text-neutral-600">
          “{quote}”
        </blockquote>
      ))}
    </div>
  );
}

function Panel({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 rounded-xl border border-neutral-200 p-6 first:mt-0">
      {title && <h2 className="mb-3 text-lg font-semibold">{title}</h2>}
      {children}
    </section>
  );
}
