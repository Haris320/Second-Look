# checklist.md: Second Look build order

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

- **Order status:** Haris's code creates orders (`pending_payment`, or `awaiting_upload` for marketplace buyers) and the Whop webhook sets them to **`paid`**. Partner's code takes it from there: `paid → in_review` (first reviewer assigned) → **`done`**. On `done` it writes `report_json` and `delivered_at`, then deletes the order's screenshots (storage files and `screenshots` rows).
- **Review progress:** partner's code keeps `reviews_done` current (approved reviews only). `/order/[id]` shows `reviews_done` of `review_target`, then renders `report_json` once `status = 'done'`.
- **Resuming panels when an order is paid** (proposal): the webhook calls `onOrderPaid(orderId)` exported from `lib/agent.ts` (partner implements it) inside `after()`, so the webhook still answers Whop immediately. Until that exists, partner's tick can resume panels whenever it finds `paid` orders.
- **Pausing sales:** partner's agent calls `setSalesOpen(false)` from `lib/whop.ts` when Terac credits can't cover the open orders, and `setSalesOpen(true)` when they can. Closing hides our Whop products and makes `createCheckout` throw "Sales are paused"; `isSalesOpen()` tells the order page to show a "back soon" message. Each call is logged to `decisions` by the caller.

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
- **Panels:** start with two, `women_21_35_us` and `men_21_35_us`, each sized to about half our **$100** Terac credits once we know the cost per reviewer. Launch a new one when a panel fills. **Pause** panels when no paid orders are waiting and **resume** when one arrives.
- **Who decides:** plain code makes routine MCP calls (launch, pause, resume, list). **Claude decides** whether to approve or reject reviews, when to pause sales because credits are low, and writes the reports. Every decision is logged to `decisions`.
- **No model fallback:** Claude calls don't use the server-side `fallbacks` option, so behavior stays predictable.
- **Privacy:** screenshots are deleted **right after the report is delivered**, not after 7 days. Page wording: "Your screenshots are deleted as soon as your report is delivered."
- **Whop:** production by default; sandbox only when `WHOP_ENVIRONMENT=sandbox`. If we buy our own product to test, refund it afterwards, and ask the organizers whether team purchases count toward revenue.
- **Submission:** public repo, deployment, 2-minute video, Whop Business ID (details in the new CLAUDE.md/plan.md).

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
- [ ] Keep `api/agent/tick` as a safety net (retry stuck reviews, pause/resume panels if they drift), protected by `CRON_SECRET`, called from a laptop loop or an external pinger.
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
