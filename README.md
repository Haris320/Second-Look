*Won 2nd place at https://www.eventbrite.com/e/zero-human-company-hackathon-by-terac-whop-nyc-tickets-2002980886751*

# Second Look

Real people review your dating profile and tell you what's working, what isn't, and what to change. Built for the Zero-Human Company hackathon (Terac, at Whop HQ): no one on the team touches an order.

- **Live:** https://second-look-beta.vercel.app
- **Whop business:** `biz_TTHTUhhUiv6lMQ`
- **Price:** $15 for one reviewer, $40 for three (`lib/tiers.ts`). Up to 10 screenshots. Works with screenshots from Hinge, Bumble, Tinder, or any app; we're independent of all of them.

## What it does

1. The customer uploads screenshots of their own profile, picks who should review it (women or men, 21–35, US), and pays on Whop.
2. Claude checks the screenshots are a dating profile with nothing explicit and no minor, and gives the customer an instant AI first read.
3. The server recruits real reviewers through the **Terac MCP**: one Terac opportunity per order, filtered to the chosen audience, with a dating-app screener and manual review of each submission.
4. Reviewers open our `/review` page from Terac, see the screenshots, and answer: would you like this profile, what works, what to change, how to improve the prompts.
5. Claude grades each review for completeness, grounding, actionability and respect, then **approves** (Terac pays the reviewer) or **rejects** it through the MCP. Rejected reviews don't count and the slot is freed.
6. When the order has its approved reviews, Claude summarizes them into a report (only reviewer text; the summary is labeled as AI), the customer is messaged on Whop, and the screenshots are deleted.
7. Every step writes one row to `decisions` with a one-line reason; `/dashboard` shows it live.

## How it works

One Next.js 16 app (App Router, Cache Components) on Vercel. Supabase Postgres and a private storage bucket. Claude via the Anthropic API. Terac via its MCP server. Whop via `@whop/sdk`.

| Path | Role |
|---|---|
| `app/page.tsx`, `app/order`, `app/order/[id]`, `app/example` | Landing, upload and checkout, private order status and report, illustrative example |
| `app/review` + `app/api/review` | Reviewer task opened from Terac; assigns a slot, shows signed screenshot URLs, saves answers, redirects to Terac's completion callback |
| `app/api/whop/webhook` | Verified `payment.succeeded` → order `screening` → `lib/first-read.ts` → `paid` / `needs_reupload` / `held`; "payment received" Whop message (`lib/notify.ts`); then `lib/recruitment.ts` |
| `lib/recruitment.ts`, `lib/recruitment-policy.ts` | Creates and launches the per-order Terac opportunity through the MCP, with a per-order cost cap and reconciliation of lost responses |
| `app/api/terac/webhook` + `lib/feedback-quality.ts` | Signed Terac events; on `awaiting_review` Claude grades the saved answers and approves/rejects via MCP (`lib/feedback-assessment.ts`, `lib/feedback-policy.ts`, `lib/feedback-actions.ts`) |
| `lib/report.ts` | Builds `report_json` from approved reviews, marks `done`, sends the results message, deletes screenshots |
| `lib/reconcile.ts` + `app/api/agent/reconcile` | Safety net for every stall path (below) |
| `app/dashboard` + `app/api/dashboard` | Password-protected revenue, orders, median paid→report time, live decision log |
| `supabase/schema.sql`, `supabase/migrations/*.sql` | Tables: `orders`, `screenshots`, `reviews`, `decisions`, `recruitment_jobs`, `feedback_quality_jobs`, `terac_webhook_events`, referrals |

Order status: `pending_payment → screening → paid → in_review → done` (plus `needs_reupload` and `held`). `reviews_done` counts approved reviews only. Every report's `review_ids` map to real Terac submissions.

### Recovery

Terac webhooks are the fast path. `POST /api/agent/reconcile` (header `Authorization: Bearer $CRON_SECRET`) is the path that always works: it retries recruitment for paid orders, polls Terac for finished submissions the webhook missed and grades them, retries interrupted quality checks, frees slots whose reviewer abandoned, re-processes unprocessed webhook events, delivers complete reports, deletes leftover screenshots, and logs `credits/low` when the Terac balance can't cover another order. It never launches anything outside the normal paid-order flow and never moves money.

**It runs itself.** Vercel Hobby crons only run daily, so the system is its own clock: every inbound event (Whop webhook, Terac webhook, reviewer start/submit, a customer polling their order page, the dashboard) calls `kickReconcile()` in `after()`, which POSTs `/api/agent/reconcile?async=1`. That route claims a heartbeat (one `decisions` row, step `reconcile`/choice `heartbeat`, updated in place with a conditional update so exactly one caller wins per 100 s), answers 202, runs the pass in `after()`, and, while any order is `paid`/`in_review` or any event or retry is open, sleeps and kicks itself again about every two minutes. Passes that moved something log `reconcile/summary`; failures log `reconcile/failed`. The daily cron (`GET`) and `scripts/reconcile-loop.mjs` just restart the chain; nothing has to run on a laptop. Without `?async=1` the route runs inline and returns the full summary (debugging).

Other protected routes: `POST /api/agent/order-paid {orderId}` (retry one order's recruitment), `POST /api/agent/review-feedback {submissionId}` (re-run one quality check), `POST /api/agent/deliver-reports` (deliver every complete order).

## Run locally

Node 22+.

```bash
npm ci
cp .env.example .env.local   # fill in values; never commit them
npm run dev
```

Environment (names only; see `.env.example`): `ANTHROPIC_API_KEY`, `TERAC_API_KEY`, `TERAC_PROJECT_ID`, `TERAC_WEBHOOK_SECRET`, `TERAC_RECRUITMENT_ENABLED`, `TERAC_MAX_ORDER_COST_CENTS`, `FEEDBACK_REVIEW_ENABLED`, `WHOP_ENVIRONMENT`, `WHOP_API_KEY`, `WHOP_BIZ_ID`, `WHOP_WEBHOOK_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `PUBLIC_BASE_URL`, `DASHBOARD_PASSWORD`, `CRON_SECRET`, `ORDER_LINK_SECRET`, `ORDER_SESSION_SECRET`. Only `NEXT_PUBLIC_*` reach the browser.

Apply `supabase/schema.sql` once, then each file in `supabase/migrations/` in date order, in the Supabase SQL editor. Create a private `screenshots` bucket (10 MB limit, PNG/JPEG/WebP).

Point a Whop webhook (`payment.succeeded`) at `/api/whop/webhook` and a Terac webhook subscription (`submission.status.change`) at `/api/terac/webhook`.

## Checks

```bash
npm run lint
npm run build
node --test tests/*.test.mjs   # mocked MCP + PGlite; recruits and pays nobody
```

## Rules the code keeps

- Every review in a report is a real, approved Terac submission. Claude summarizes; it never invents reviews or scores.
- Own profile only, adults only (required checkboxes); reviewers filtered to 21–35.
- Screenshots live in a private bucket, are shown to reviewers only through signed short-lived URLs, and are deleted as soon as the report is delivered.
- The agent never refunds or moves money. Held orders are refunded by a human in the Whop dashboard.
- Every automated decision is logged to `decisions`.

More detail: `checklist.md` (decisions and the order lifecycle), `docs/handoff.md` (current state), `docs/terac-recruitment.md`, `docs/feedback-quality.md`, `docs/terac-webhook.md`.
