# checklist.md: Second Look build order

Turns `plan.md` into steps. **A** = backend/agent, **B** = frontend/sales, **You** = a human-only task (accounts, keys, asking staff).
Each step has a **Check** that proves it works. Don't start the next step on the same track until its check passes.

Verified on 2026-10-24 against live docs / endpoints (details at the bottom). Anything marked **(unverified)** must be confirmed before code depends on it.

---

## Step 0: unblock money and reviewers (You, now, in parallel with everything)

- [ ] **Whop production:** create/confirm the business, finish payout/KYC, create one product with three one-time plans ($9 / $19 / $29), create an API key, and fill `WHOP_API_KEY`, `WHOP_BIZ_ID`. **Ask Whop staff:** "Can this account take live card payments today? Anything pending on payouts/verification?"
- [ ] **Terac:** get researcher access and an **organization API key** → `TERAC_API_KEY`. (The MCP endpoint accepts it directly as `Authorization: Bearer tk_...`, so `TERAC_MCP_TOKEN` is probably the same value. Confirm.)
- [ ] **Ask Terac staff:**
  1. Cost per participant for a ~5-minute b2c task? Is credit **reserved at launch** for `num_participants`? (Decides panel size and prices.)
  2. How many credits do we have?
  3. Can we get a **sandbox organization** key? (Docs say sandbox orgs exist and support simulated `test-submissions`.)
  4. Does "use the Terac MCP on the server" require an **LLM agent** driving the MCP, or does our server calling MCP tools directly count?
  5. What happens to a reviewer who opens the task when we have no order for them? Is there a "no work available" callback result, or should we pause the opportunity?
- [ ] **Repo:** decide where to push (see question at the end of the chat).

## Step 1: foundations (A and B in parallel, ~30 min)

- [ ] **A:** `supabase/schema.sql` with the five tables from CLAUDE.md, plus an `assigned_at` / `reviewer_started_at` on `reviews` (needed for the 60-second check and to stop over-assigning). **You** paste it into the Supabase SQL editor (the service key can't run DDL over REST). **A** creates the private `screenshots` bucket via the Storage API.
  - **Check:** REST lists the 5 tables; bucket exists with `public=false`.
- [ ] **B:** deploy the empty Next.js app to Vercel, set env vars there, fill `PUBLIC_BASE_URL`.
  - **Check:** `https://<app>.vercel.app` loads.
- [ ] **Everyone:** read `AGENTS.md`. This is Next.js 16.4, so check `node_modules/next/dist/docs/` before writing route handlers.

## Step 2: Terac connection spike (A, ~30 min). Highest technical risk, do it first

- [ ] `scripts/terac-tools.ts`: connect from Node to `https://terac.com/api/mcp` with `Authorization: Bearer $TERAC_API_KEY`, list tools, call `terac_get_context`. Save the real tool names and input schemas to `docs/terac-tools.json` so nobody guesses shapes.
- [ ] From the tool descriptions, write down: the opportunity-create fields, filter slugs for gender/age/country, the callback URL contract, how to list submissions, and whether approve/reject are MCP tools (else REST `POST /api/external/v2/submissions/{id}/approve|reject`).
- [ ] Prove the Claude path once too: one Messages API call with the MCP connector (`mcp_servers: [{type:"url", url, name:"terac", authorization_token}]` + `tools: [{type:"mcp_toolset", mcp_server_name:"terac"}]`, beta `mcp-client-2025-11-20`) that calls `terac_get_context`.
  - **Check:** the script prints the tool list and our balance; the Claude call returns the same balance.

## Step 3: Whop money path in sandbox (A, ~45 min, after Step 1)

- [ ] `lib/whop.ts` with `@whop/sdk`; switch between sandbox and production on `WHOP_ENVIRONMENT`.
- [ ] `api/whop/webhook`: verify with `unwrapWebhook(rawBody, {headers, key: WHOP_WEBHOOK_SECRET})`; on `payment.succeeded` mark the order `paid` (idempotent on `whop_payment_id`); log to `decisions`.
- [ ] **Flow A** (from our site): `checkoutConfigurations.create` per order with the order ID attached. Inline-plan `metadata` is confirmed in the SDK; top-level `metadata` / `redirect_url` on the checkout config are **(unverified)**, so check the installed SDK types before relying on them.
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
- [ ] Empty queue: show "no profile right now" and use whatever Terac says for no-work cases (Step 0, question 5).
  - **Check:** open `/review?audience=women_21_35_us&teracSubmissionId=test1` by hand → see the test order → submit → row saved → redirected.

## Step 6: QC, approve, report (A, ~60 min)

- [ ] **Event-driven instead of a 1-minute cron:** on review submit, run (via `after()`) the rule checks (all answered, ≥60 s) plus one Claude call for specificity and abuse → approve or reject through Terac → bump `reviews_done` → if the target is reached, generate the report (Claude summarizes **only** real answers; prompt rewrites labelled as AI) → status `done`. Every step goes to `decisions`.
- [ ] Keep `api/agent/tick` as a safety net (retry stuck reviews, pause/resume panels when the queue is empty or busy), protected by `CRON_SECRET`, called from a laptop loop or an external pinger.
  - **Check:** a lazy test review ("looks good") gets rejected with a logged reason; a good one gets approved; at the target the report renders on `/order/[id]`.

## Step 7: launch panels (A, after Steps 2 and 5)

- [ ] Sandbox org first: create + launch `women_21_35_us` and `men_21_35_us` with `business_type:"b2c"`, filters, one screening question, `tasks[].review_type:"manual_review"`, `duration_minutes:5`, and a task URL pointing to `/review?audience=...`. Fire `test-submissions` with `task_completion:"redirect"`.
- [ ] Production: same settings, with `num_participants` sized to the credit answer from Step 0.
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
- **Whop:** `checkoutConfigurations.create({ plan_id | plan: {..., metadata, plan_type:"one_time"} })`; webhook verification is `unwrapWebhook` from `@whop/sdk/helpers` (reads the `webhook-id` / `webhook-timestamp` / `webhook-signature` headers, key is the `ws_...` secret).
- **Keys:** the Anthropic, Supabase service and Whop sandbox keys all answer 200. Supabase has no tables and no buckets yet.
