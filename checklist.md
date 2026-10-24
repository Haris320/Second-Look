# checklist.md: Second Look build order

> **Status (2026-10-24, 19:15 UTC):** the loop is built end to end and live. Pricing is $15 for 1 reviewer (`quick`) or $40 for 3 (`full`), up to 10 screenshots. Recruitment creates **one Terac opportunity per order** (docs/terac-recruitment.md), not shared panels; anything below about "panels" is historical. Current state, order table and open issues: `docs/handoff.md`. Recovery: `/api/agent/reconcile` is self-triggering (kicked by every inbound event, heartbeat-deduplicated, re-kicks itself every ~2 minutes while orders are open; README "Recovery").

Turns `plan.md` into steps. **A** = backend/agent, **B** = frontend/sales, **You** = a human-only task (accounts, keys, asking staff).
Each step has a **Check** that proves it works. Don't start the next step on the same track until its check passes.

Verified on 2026-10-24 against live docs / endpoints (details at the bottom). Anything marked **(unverified)** must be confirmed before code depends on it.

## Ownership (2026-10-24)

Only edit files you own. Shared files need a heads-up to the other person before any change.

| Owner | Files |
|---|---|
| **Haris: Whop + customer side** | `lib/whop.ts`, `lib/tiers.ts`, `app/api/whop/*`, `app/api/orders/*`, pages `/`, `/order`, `/start`, `/order/[id]`, the Vercel deployment |
| **Partner: Terac + agent** | `scripts/terac-*`, `lib/terac*`, `lib/agent*`, `lib/report*`, `app/api/review/*`, `app/api/agent/*`, page `/review` |
| **Shared (heads-up first)** | `lib/supabase.ts`, `lib/log.ts`, `supabase/schema.sql` |

### Handoff between the two halves

- **Order status:** Haris's code creates orders (`pending_payment`, or `awaiting_upload` for marketplace buyers). The Whop webhook sets them to `screening`, and the AI first read (`lib/first-read.ts`) moves them to **`paid`** or `held`. Partner's code only ever picks up `paid` orders and takes it from there: `paid → in_review` (first reviewer assigned) → **`done`**. On `done` it writes `report_json` and `delivered_at`, then deletes the order's screenshots (storage files and `screenshots` rows).
- **Review progress:** partner's code keeps `reviews_done` current (approved reviews only). `/order/[id]` shows `reviews_done` of `review_target`, then renders `report_json` once `status = 'done'`.
- **Resuming panels when an order is paid** (agreed): after marking an order `paid`, the webhook calls `POST /api/agent/order-paid` with body `{ "orderId": "<uuid>" }` and header `Authorization: Bearer $CRON_SECRET`, inside `after()` so Whop gets its 200 first. **Partner owns that route**; it checks the secret and calls `onOrderPaid(orderId)` from `lib/agent.ts`. Until the route exists the call gets a 404 and does nothing; partner's tick also resumes panels whenever it finds `paid` orders. (It's a route rather than a direct import because Turbopack fails the build on an import of a file that isn't merged yet.) Flow B orders reach `paid` when the buyer uploads on `/start`, which calls the same route.
- **Pausing sales: emergency switch only.** No automatic sales cap; we top up Terac credits as needed. `setSalesOpen(false)` in `lib/whop.ts` stays as a manual stop (hides our Whop products, makes `createCheckout` throw "Sales are paused"; `setSalesOpen(true)` reopens). Whoever calls it logs the call to `decisions`.
- **Note for partner, when Terac goes live:**
  - Resume panels for **every waiting `paid` order, oldest first**, not only orders paid after launch. Orders paid while Terac was down are already waiting, and `notifyOrderPaid` won't fire for them again.
  - When credits drop low, **log an alert** to `decisions` (for example `credits/low` with the balance and how many orders it covers) so Haris can top up. Don't pause sales automatically.

### The zero-human loop, end to end

Every paid order runs through these steps with no one on the team touching it. Each step logs one `decisions` row (step/choice in brackets; the partner's are suggested names), which `/dashboard` shows live.

| # | Step | Owner | Status |
|---|---|---|---|
| 1 | Customer uploads and pays on a per-order Whop checkout. The webhook verifies the signature, re-fetches the payment, and marks the order `screening` [`payment/paid`] | Haris | **Live** (7 real payments) |
| 2 | **AI first read:** Claude checks the screenshots are a dating profile, with nothing explicit and no minor. Pass → `paid`, instant feedback on `/order/[id]` labeled as AI [`first_read/passed`]. Not a dating profile or screenshots missing → `needs_reupload`: the customer re-uploads on `/order/[id]` and the read runs again [`first_read/needs_reupload`, `reupload/screening`]. Explicit, looks under 18, or the check errors twice → `held` for refund [`first_read/retry`, `first_read/held`]. No reviewer sees anything but `paid` | Haris | **Live** |
| 3 | Hand the passed order to the agent: `runFirstRead` calls `recruitOrder` directly inside the webhook's `after()`; `POST /api/agent/order-paid` retries one order; reconcile retries all | Both | **Live** |
| 4 | **Recruit for the order:** `recruitOrder` creates a Terac draft filtered to the order's audience (21–35, US, gender), screener, `manual_review`, 5 min, task URL with a private token, checks the quote against the cap and balance, launches [`recruitment/launched`, `needs_attention`, `retryable`, `reconciled`, `reset`] | Partner | **Live** (5 real launches) |
| 5 | **Reviewer opens `/review`** from Terac: submission verified via MCP, slot assigned atomically, order `paid → in_review`, signed 10-minute image URLs [`review/assigned`] | Partner | **Live** (1 real assignment) |
| 6 | Reviewer submits; answers saved with server-measured duration (≥ 60 s); redirect to the Terac callback [`review/submitted`] | Partner | Built; first real submit pending |
| 7 | **Quality check:** Terac webhook `awaiting_review` (or reconcile polling) → Claude grades against the screenshots → approve (Terac pays) or reject via MCP; `reviews_done` counts approved only [`review_quality/approved`, `rejected`, `needs_attention`] | Partner | Built and unit-tested; first real check pending |
| 8 | **Credits:** reconcile checks the Terac balance each run and logs `credits/low` under $18. No automatic sales pause; Haris tops up | Both | **Live** (fired at $10) |
| 2b | **"Payment received" Whop message:** thanks, private link, results by tonight, results also arrive here. Sent from the webhook alongside the first read, through a Whop support chat as the business [`notify/paid_sent` or `notify/paid_failed`] | Haris | Live |
| 9 | **Report:** at `review_target`, Claude summarizes approved reviews only into `report_json` (summary, top fixes, prompt feedback, each reviewer's own words; `review_ids`); status `done`, `delivered_at` [`report/delivered`, `report/failed`] | Partner | Built; first real delivery pending |
| 9b | **"Results are in" Whop message:** `notifyResultsReady(orderId)` right after `status = 'done'` [`notify/results_sent` or `notify/results_failed`] | Haris | Wired in `lib/report.ts`; first real send pending |
| 10 | **Delete screenshots:** storage files and `screenshots` rows, right after delivery; reconcile deletes leftovers [`privacy/deleted`, `privacy/delete_failed`] | Partner | Built; first real deletion pending |
| 11 | Held orders (explicit, under 18, or check errored twice): refund in the Whop dashboard. The agent never moves money, so this is the one human step | Haris (human) | Manual by design |

### Proposed `report_json` shape (agree before building)

Written once by partner's code, read by `/order/[id]`. Photos are referred to by `screenshots.position` (1-based), because the images are deleted on delivery. Every number and quote comes from approved reviews; only `ai_rewrites` is AI-written, and the page labels it that way.

```json
{
  "version": 1,
  "generated_at": "2026-10-24T18:00:00Z",
  "review_count": 5,
  "like": { "yes": 3, "maybe": 1, "no": 1 },
  "photos": [
    { "position": 1, "avg_score": 7.4, "best_votes": 2, "worst_votes": 0 },
    { "position": 2, "avg_score": 5.1, "best_votes": 0, "worst_votes": 3 }
  ],
  "lead_photo": 1,
  "cut_photo": 2,
  "prompts": {
    "works":      { "summary": "The travel prompt feels specific and fun.", "quotes": ["The Lisbon story made me smile"] },
    "falls_flat": { "summary": "The 'simple pleasures' answer is generic.", "quotes": ["Everyone says coffee and dogs"] }
  },
  "come_across": [ { "word": "funny", "count": 3 }, { "word": "adventurous", "count": 2 } ],
  "top_fixes": [
    { "fix": "Lead with the beach photo instead of the group shot", "mentions": 3 },
    { "fix": "Replace the sunglasses selfie", "mentions": 2 },
    { "fix": "Make the 'simple pleasures' answer more specific", "mentions": 2 }
  ],
  "ai_rewrites": [ { "prompt": "My simple pleasures", "rewrite": "Finding the one bakery in every city that still sells day-old bread for a dollar" } ],
  "review_ids": ["<reviews.id>", "<reviews.id>"]
}
```

`ai_rewrites` is an empty array for tiers without prompt rewrites. `review_ids` ties every report back to real Terac submissions (golden rule 2).

## Decisions (team, 2026-10-24)

- **Terac callback:** `https://terac.com/api/external/callback?teracSubmissionId={id}&result=completed`. Other `result` values: `screened_out`, `quota_full`, `rejected`. A reviewer who arrives to an empty queue is sent back with `result=quota_full`.
- **Recruitment (supersedes panels):** one Terac opportunity per paid order, `num_participants` = the purchased reviewer count, $6 per reviewer. Credits were $100; five launches used $90 by 19:08 UTC. Top up before selling more.
- **Who decides:** plain code makes routine MCP calls (launch, pause, resume, list). **Claude decides** whether to approve or reject reviews, when to pause sales because credits are low, and writes the reports. Every decision is logged to `decisions`.
- **No model fallback:** Claude calls don't use the server-side `fallbacks` option, so behavior stays predictable.
- **Privacy:** screenshots are deleted **right after the report is delivered**, not after 7 days. Page wording: "Your screenshots are deleted as soon as your report is delivered."
- **Whop:** production by default; sandbox only when `WHOP_ENVIRONMENT=sandbox`. If we buy our own product to test, refund it afterwards, and ask the organizers whether team purchases count toward revenue.
- **Submission:** public repo, deployment, 2-minute video, Whop Business ID (details in the new CLAUDE.md/plan.md).
- **Pricing (supersedes the CLAUDE.md table):** **$15 for 1 reviewer** (`quick`) or **$40 for 3** (`full`), `TIERS` in `lib/tiers.ts`. Checkout is created per order from `/order`; the webhook accepts $15 and $40. Legacy $15/3-review orders keep their target.
- **Audiences:** customers choose one of exactly two: **"Women, 21–35, US"** (`women_21_35_us`) or **"Men, 21–35, US"** (`men_21_35_us`). No custom age ranges. The list lives in `AUDIENCES` in `lib/tiers.ts`, and each key matches one of the two Terac panels. `/api/orders` rejects anything else.
- **Marketplace: still parked.** Proposed design (from Whop docs, 2026-10-24): Whop appends `payment=pay_…` and `status=succeeded|failed|canceled` to a checkout's `redirect_url`/`returnUrl`, with our own query params intact. So a store product's post-purchase link can point at `/start`; `/start` reads `payment`, and the server calls `whop.payments.retrieve(payment)` and checks `status === "paid"`, the amount, and that no order already has that `whop_payment_id`, then claims the `awaiting_upload` order the webhook created for that payment and shows the upload form. Fulfilment still comes from the `payment.succeeded` webhook; the redirect only claims, it never trusts the browser. Not built; `/api/orders/claim` stays disabled until it is.
- **Delivery promise:** "Results by tonight" everywhere (landing, order form, order page, Whop checkout description) while Terac is down. Tighten it once Terac is live and we know real turnaround.
- **Test order `b5a2985e…`:** Haris's $15 test; `needs_reupload`, marked `manual/test_order` (excluded from the dashboard). Never recruits. Refund in Whop, then delete it with its files, `screenshots` rows and `decisions` rows.

---

## Step 0: unblock money and reviewers (You, now, in parallel with everything)

- [ ] **Whop production:** create/confirm the business, finish payout/KYC, create one product with three one-time plans ($9 / $19 / $29), create an API key, and fill `WHOP_API_KEY`, `WHOP_BIZ_ID`. **Ask Whop staff:** "Can this account take live card payments today? Anything pending on payouts/verification?"
- [ ] **Terac:** get researcher access and an **organization API key** → `TERAC_API_KEY`. (The MCP endpoint accepts it directly as `Authorization: Bearer tk_...`, so `TERAC_MCP_TOKEN` is probably the same value. Confirm.)
- [ ] **Ask Terac staff:**
  1. Cost per participant for a ~5-minute b2c task? Is credit **reserved at launch** for `num_participants`? (Decides panel size and prices.)
  2. How many credits do we have?
  3. Can we get a **sandbox organization** key? (Docs say sandbox orgs exist and support simulated `test-submissions`.)
  4. ~~LLM agent vs direct MCP calls?~~ Decided: direct calls count; Claude makes the judgment calls (see Decisions).
  5. ~~Reviewer arrives with no order?~~ Decided: `result=quota_full`, and pause panels when idle.
- [ ] **Repo:** decide where to push (see question at the end of the chat).

## Step 1: foundations (A and B in parallel, ~30 min)

- [ ] **A:** `supabase/schema.sql` with the five tables from CLAUDE.md, plus an `assigned_at` / `reviewer_started_at` on `reviews` (needed for the 60-second check and to stop over-assigning). **You** paste it into the Supabase SQL editor (the service key can't run DDL over REST). **A** creates the private `screenshots` bucket via the Storage API.
  - **Check:** REST lists the 5 tables; bucket exists with `public=false`.
- [ ] **B:** deploy the empty Next.js app to Vercel, set env vars there, fill `PUBLIC_BASE_URL`.
  - **Check:** `https://<app>.vercel.app` loads.
- [ ] **Everyone:** read `AGENTS.md`. This is Next.js 16.4, so check `node_modules/next/dist/docs/` before writing route handlers.

## Step 2: Terac connection spike (A, ~30 min). Highest technical risk, do it first

- [ ] `scripts/terac-tools.ts`: connect from Node to `https://terac.com/api/mcp` with `Authorization: Bearer $TERAC_API_KEY`, list tools, call `terac_get_context`. Save the real tool names and input schemas to `docs/terac-tools.json` so nobody guesses shapes.
- [ ] From the tool descriptions, write down: the opportunity-create fields, filter slugs for gender/age/country, the cost per reviewer, how to list submissions, how to pause and resume, and whether approve/reject are MCP tools (else REST `POST /api/external/v2/submissions/{id}/approve|reject`).
- [ ] Prove the Claude path once too: one Messages API call with the MCP connector (`mcp_servers: [{type:"url", url, name:"terac", authorization_token}]` + `tools: [{type:"mcp_toolset", mcp_server_name:"terac"}]`, beta `mcp-client-2025-11-20`) that calls `terac_get_context`.
  - **Check:** the script prints the tool list and our balance; the Claude call returns the same balance.

## Step 3: Whop money path in sandbox (A, ~45 min, after Step 1)

- [ ] `lib/whop.ts` with `@whop/sdk`; switch between sandbox and production on `WHOP_ENVIRONMENT`.
- [ ] `api/whop/webhook`: verify with `unwrapWebhook(rawBody, {headers, key: WHOP_WEBHOOK_SECRET})`; on `payment.succeeded` mark the order `paid` (idempotent on `whop_payment_id`); log to `decisions`.
- [ ] **Flow A** (from our site): `checkoutConfigurations.create` per order with top-level `metadata: { order_id }` (the SDK says it's "copied to payments and memberships") and `redirect_url` → `/order/[id]`.
- [ ] The webhook envelope for `payment.succeeded` isn't published. So the handler reads only the event name and `data.id`, then re-fetches the payment with `payments.retrieve` and trusts that.
- [ ] **Flow B** (from the marketplace): `/start` matches by email. Treat it as the fallback, not the main path (see risks).
  - **Check:** a sandbox purchase flips a test order to `paid` within seconds, and a replayed webhook doesn't double-count.

## Step 4: customer pages (B, ~90 min, starts right after Step 1)

- [ ] `/` landing (headline, how it works, pricing, FAQ incl. privacy + "works with Hinge, Bumble, and Tinder profiles", no logos).
- [ ] `/order`: 3–8 uploads to the private bucket, audience, tier, email, two required checkboxes → create order `pending_payment` → redirect to Whop checkout URL from A's endpoint.
- [ ] `/order/[id]`: "3 of 5 reviews in", then the report.
- [ ] Whop product page copy + post-purchase link to `/start`.
  - **Check:** submitting the form creates an `orders` row and `screenshots` rows, and the files are in the bucket.

## Step 5: reviewer page (A builds the API, B the UI, ~60 min)

- [ ] `GET /api/review?audience=&teracSubmissionId=`: assign the oldest paid order for that audience whose `reviews_done + in_flight < review_target` (Rush first), insert a `reviews` row with `assigned_at`, and return signed screenshot URLs (short expiry).
- [ ] `POST /api/review`: save answers + `duration_s`, then redirect to the Terac callback.
- [ ] Empty queue: redirect straight back to the Terac callback with `result=quota_full`.
  - **Check:** open `/review?audience=women_21_35_us&teracSubmissionId=test1` by hand → see the test order → submit → row saved → redirected.

## Step 6: QC, approve, report (A, ~60 min)

- [ ] **Event-driven instead of a 1-minute cron:** on review submit, run (via `after()`) the rule checks (all answered, ≥60 s) plus one Claude call for specificity and abuse → approve or reject through Terac → bump `reviews_done` → if the target is reached, generate the report (Claude summarizes **only** real answers; prompt rewrites labelled as AI) → status `done` → **delete the order's screenshots**. Every step goes to `decisions`.
- [ ] Panels: when the last waiting order is assigned, pause the panels; when a paid order arrives (webhook), resume them. Claude checks the Terac balance after each approval and pauses sales (hides checkout) when credits can't cover the open orders.
- [x] Safety net: `api/agent/reconcile`, protected by `CRON_SECRET`, self-kicking from inbound events plus a heartbeat (no laptop loop or external pinger needed).
  - **Check:** a lazy test review ("looks good") gets rejected with a logged reason; a good one gets approved; at the target the report renders on `/order/[id]`.

## Step 7: launch panels (A, after Steps 2 and 5)

- [ ] Sandbox org first: create + launch `women_21_35_us` and `men_21_35_us` with `business_type:"b2c"`, filters, one screening question, `tasks[].review_type:"manual_review"`, `duration_minutes:5`, and a task URL pointing to `/review?audience=...`. Fire `test-submissions` with `task_completion:"redirect"`.
- [ ] Production: same settings; each panel's `num_participants` ≈ ($100 ÷ 2) ÷ cost per reviewer. Start paused if no paid orders are waiting.
  - **Check:** sandbox test submission → lands on our page → callback completes → shows as completed in Terac. Production panels are `active`.

## Step 8: one real paid order end to end (both)

- [ ] Buy your own Quick Look on production Whop. Don't touch anything until the report is delivered.
  - **Check:** payment → paid → 5 real Terac reviews → approvals → report, with no manual steps. **Start selling now.**

## Step 9 onward: sell (B leads), polish (A)

As in `plan.md` hours 3–5: post your own result, DMs, communities, QR code, ask Whop to feature the listing. A builds `/dashboard` (password: `DASHBOARD_PASSWORD`) with revenue, orders, time to first review, and the live decision log. Freeze 45 minutes before the end.

---

## Parallel tracks

| Time | A (backend) | B (frontend + sales) | You (human-only) |
|---|---|---|---|
| 0:00–0:30 | Schema SQL + bucket; Terac spike | Vercel deploy; landing copy | Whop production + KYC; Terac key + questions |
| 0:30–1:30 | Whop webhook + checkout (sandbox) | `/order`, `/order/[id]`, Whop listing | Paste schema SQL; fill env vars in `.env.local` and Vercel |
| 1:30–2:30 | Reviewer API, QC/approve/report | `/review` UI, `/start` | Make your own example profile result |
| 2:30–3:00 | Panels live; Step 8 test | Step 8 test | Buy the first real order |
| 3:00+ | Fixes, dashboard | Sell | Sell |

---

## What's verified (2026-10-24)

- **Terac MCP auth:** `POST https://terac.com/api/mcp` without credentials returns 401 with "Use an API key (x-api-key header or Authorization: Bearer tk_...) or OAuth session." So a server can use it with an org API key.
- **Terac REST v2** (`https://terac.com/api/external/v2`, Bearer API key): `POST /submissions/{id}/approve|reject`, `POST /opportunities`, `POST /opportunities/{id}/launch`, `GET /filters`, sandbox-only `POST /opportunities/{id}/test-submissions`. Webhooks `submission.status.change` / `submission.approved` are signed with `X-Terac-Request-Signature` = base64 HMAC-SHA256(secret, timestamp + body). Terac appends `submissionId`, `teracSubmissionId`, `taskId` to the task URL. Participant pay is **derived from `duration_minutes`** (or a feasibility quote), not set directly. Insufficient balance → 412 at launch.
- **Anthropic MCP connector:** `mcp_servers` entries take `authorization_token`; a matching `mcp_toolset` in `tools` is required; beta `mcp-client-2025-11-20`.
- **Whop** (`@whop/sdk` 2.6.0 types): `new WhopClient({ token, environment: WhopEnvironment.Production | Sandbox })`; `checkoutConfigurations.create({ plan_id | plan: {initial_price, plan_type:"one_time", ...}, metadata, redirect_url })` returns `purchase_url`; `payments.retrieve({ id })` returns `status` ("paid"), `metadata`, `checkout_configuration_id`, `customer_email`, `usd_total.amount` (decimal string). Webhook verification is `unwrapWebhook` from `@whop/sdk/helpers` (reads the `webhook-id` / `webhook-timestamp` / `webhook-signature` headers, key is the `ws_...` secret).
- **Keys:** the Anthropic, Supabase service and Whop sandbox keys all answer 200. Supabase has no tables and no buckets yet.
