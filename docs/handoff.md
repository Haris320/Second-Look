# Second Look: handoff summary (2026-10-24)

Context for an agent picking this up. No secret values appear here; keys live only in `.env.local` (gitignored) and Vercel.

**You (the next agent) have MCP access.** Haris will continue this conversation with you.
- Use **whop-docs** for every Whop API question. Make Whop changes through our code (`lib/whop.ts`), so they're logged, not through the Whop MCP.
- Use **supabase** to inspect data or apply schema changes, but give a heads-up first because the schema is a shared file.
- Use **terac** to read the real tool list once it's signed in, and to help the partner. Don't edit the partner's Terac files.
- Start with `git pull`. Then read `checklist.md` (source of truth) and the "Where things stand right now" section below.

## The project

- **Product:** real people review your dating profile screenshots and you get a report (like rate, photo ranking, prompt feedback, top fixes). Hackathon: Zero-Human Company by Terac at Whop HQ. **Most revenue wins.**
- **Hard requirements:** use the **Terac MCP on the server** to recruit and manage reviewers; take payments through **Whop**.
- **Submission needs:** public repo, a deployment, a 2-minute video, the Whop Business ID (`biz_TTHTUhhUiv6lMQ`).
- **Docs in repo:** `CLAUDE.md` (product spec; its pricing table is outdated), `plan.md` (hour plan), `checklist.md` (**source of truth** for steps, ownership, decisions, handoff contract, `report_json` shape), `docs/frontend-integration.md` (teammate's frontend notes).

## Links

- **Repo:** https://github.com/Haris320/Second-Look (public, branch `main`; Vercel auto-deploys every push)
- **Live site (use this URL everywhere):** https://second-look-beta.vercel.app
  - `second-look-haris320s-projects.vercel.app` still sits behind a Vercel login wall. Don't point anything there.
- **Vercel:** team `haris320s-projects`, project `second-look`. Folder is linked (`.vercel/`, gitignored); the CLI is logged in.
- **Supabase:** project ref `ulduttuvjifeakriyqre`; private bucket `screenshots`; tables `orders`, `screenshots`, `reviews`, `panels`, `decisions` (RLS on, no policies; only the server's service key reads or writes).

## Ownership (from checklist.md; don't edit the other person's files)

| Owner | Files |
|---|---|
| **Haris: Whop + customer side + deploy** | `lib/whop.ts`, `lib/tiers.ts`, `lib/orders.ts`, `app/api/whop/*`, `app/api/orders/*`, pages `/`, `/order`, `/start`, `/order/[id]`, Vercel |
| **Partner: Terac + agent** | `scripts/terac-*`, `lib/terac*`, `lib/agent*`, `lib/report*`, `app/api/review/*`, `app/api/agent/*`, page `/review` |
| **Shared (heads-up first)** | `lib/supabase.ts`, `lib/log.ts`, `supabase/schema.sql` |
| **Frontend teammate (yarora21)** | Rebuilt the UI: `components/*`, `app/globals.css`, `/example`, `/dashboard`, `lib/uploads.ts`, `lib/audience.ts`, `lib/order-access.ts`, `lib/verify-uploads.ts`, plus the order routes' current versions |

## Decisions made

- **Pricing:** one offer, **$15 for 3 reviews** (`REVIEW_OFFER` in `lib/tiers.ts`, stored as tier `quick`). This replaces the CLAUDE.md table.
- **Audiences (decided):** exactly two choices, **"Women, 21–35, US"** (`women_21_35_us`) and **"Men, 21–35, US"** (`men_21_35_us`), matching the two Terac panels the partner will launch. No custom age ranges.
  - Canonical list: `AUDIENCES` in `lib/tiers.ts`, with `isAudience()`.
  - The form sends `audience`, and `/api/orders` rejects any other value.
  - `audienceLabel()` in `lib/audience.ts` reads the same list.
- **Flow:** upload first, then pay (`/order` → per-order Whop checkout). **Whop marketplace listing is on hold** until a store purchase can be securely linked to an order. `/api/orders/claim` is disabled because an email alone isn't proof of payment, and `/start` only shows a help message.
- **Terac:** callback `https://terac.com/api/external/callback?teracSubmissionId={id}&result=completed`. Other results: `screened_out`, `quota_full`, `rejected`. A reviewer who arrives to an empty queue gets `result=quota_full`. Pause panels when no paid orders are waiting; resume when one is paid. Budget: **$100 of Terac credits**, and credits are locked for the whole panel size.
- **Agent:** plain code makes routine MCP calls. **Claude decides** whether to approve or reject reviews, when to pause sales because credits are low (`setSalesOpen(false)`), and writes the reports. Log every decision to `decisions`. **No server-side model fallback** (keeps behaviour predictable).
- **Privacy:** screenshots are deleted right after the report is delivered.
- **Whop:** production by default; sandbox only when `WHOP_ENVIRONMENT=sandbox`. Make Whop changes through our code (so they're logged), not through the Whop MCP. For Whop API questions use the whop-docs MCP or the SDK's types, never guesses.
- **Money rules:** the agent never refunds or moves money. Haris refunds test purchases in the Whop dashboard. Ask the organizers whether purchases by our own team count toward revenue.

## What works now

- **Customer flow (live):** upload up to 10 screenshots to the private bucket → order `pending_payment` → `POST /api/orders/[id]/checkout` → `createCheckout()` makes a **production** $15 one-time Whop checkout with `metadata.order_id` and a redirect to `/order/[id]`.
  - Checkout creation was verified in production by creating and then deleting one.
- **Webhook** `app/api/whop/webhook/route.ts` (live; `WHOP_WEBHOOK_SECRET` set; unsigned requests get 401; **proven with a real payment**):
  - Verifies with `unwrapWebhook` (`@whop/sdk/helpers`), reads only the event name and `data.id`, then re-fetches the payment with `whop.payments.retrieve` and checks `status === "paid"`.
  - With `metadata.order_id`: marks the order `paid`, stores `whop_payment_id`, `amount_cents` and `paid_at`, logs a decision, and inside `after()` calls `notifyOrderPaid()` → `POST /api/agent/order-paid` with `Bearer $CRON_SECRET`. That route doesn't exist yet, so it gets a 404, which is fine.
  - Without an order ID (a marketplace purchase): creates an `awaiting_upload` order if the amount is $15.
- **`setSalesOpen(open)` / `isSalesOpen()`** in `lib/whop.ts`: hide or show Whop products (tagged `metadata.sales_paused`); `createCheckout` throws "Sales are paused" while any product is tagged. Tested in sandbox.
- **Terac spike script** `scripts/terac-tools.mjs` (`npm run terac:tools`, `npm run terac:claude`): lists the MCP tools into `docs/terac-tools.json` and calls `terac_get_context`. It's wired correctly (Terac returns 401 to a dummy key) but **hasn't run with a real key**.

## Not built yet (partner's side, blocks fulfilment)

- `/review` reviewer page and API: assign the oldest paid order for the reviewer's audience, show signed screenshot URLs, save answers, redirect to the Terac callback.
- `POST /api/agent/order-paid` → `onOrderPaid(orderId)`: resume panels.
- Quality check with Claude → approve or reject through Terac → `reviews_done` → `report_json` (shape in checklist.md) → status `done` → delete screenshots.
- Launching the two panels (`women_21_35_us`, `men_21_35_us`) through the Terac MCP: age 21–35, the matching gender, US, `manual_review`, about 5 minutes. Size them so both fit in the $100 of credits once the cost per reviewer is known. Each panel's task URL is `https://second-look-beta.vercel.app/review?audience=<key>`.

## Env status (names only)

- **Set** (local and Vercel production; secrets marked sensitive): `ANTHROPIC_API_KEY`, `WHOP_ENVIRONMENT=production`, `WHOP_API_KEY`, `WHOP_BIZ_ID`, `WHOP_WEBHOOK_SECRET`, `WHOP_SANDBOX_API_KEY`, `WHOP_SANDBOX_BIZ_ID`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `PUBLIC_BASE_URL=https://second-look-beta.vercel.app`, `DASHBOARD_PASSWORD`, `CRON_SECRET`.
- **Empty:** `TERAC_API_KEY`, `TERAC_MCP_TOKEN`, `WHOP_SANDBOX_WEBHOOK_SECRET`.
- **MCP servers** (Claude Code, user scope): whop-docs, whop and supabase are connected; **terac needs `/mcp` sign-in**. They only load in sessions started after they were added.

## Verified API facts (don't re-derive)

- **Terac MCP** `https://terac.com/api/mcp` accepts an org API key as `Authorization: Bearer tk_...` (or `x-api-key`).
- **Terac REST v2** `https://terac.com/api/external/v2`:
  - `POST /submissions/{id}/approve|reject`, `POST /opportunities`, `POST /opportunities/{id}/launch`, `GET /filters`; sandbox-only `POST /opportunities/{id}/test-submissions`.
  - Participant pay is derived from `duration_minutes`; you can't set it. An insufficient balance returns 412.
  - Terac appends `submissionId`, `teracSubmissionId` and `taskId` to the task URL.
  - Webhooks are signed: `X-Terac-Request-Signature` = base64 HMAC-SHA256(secret, timestamp + body).
- **Anthropic MCP connector:**
  - `mcp_servers: [{type:"url", url, name, authorization_token}]`
  - plus `tools: [{type:"mcp_toolset", mcp_server_name}]`
  - with beta `mcp-client-2025-11-20`. Model: `claude-opus-5-5`.
- **Whop SDK `@whop/sdk` 2.6.0:**
  - `new WhopClient({ token, environment })`.
  - `checkoutConfigurations.create({ account_id, plan: {initial_price, plan_type:"one_time", ...}, metadata, redirect_url })` returns `purchase_url`. Top-level `metadata` is copied to the payment.
  - `redirect_url` **must be https**.
  - `list()` returns a promise of a page: use `for await (const x of await whop.products.list(...))`.
  - `payments.retrieve` fields: `status`, `metadata`, `usd_total.amount` (decimal string), `customer_email`.
  - Sandbox API: `https://sandbox-api.whop.com/api/v1`.

## Gotchas hit

- **Next 16.4 with Cache Components:**
  - `useParams()` in a client page must sit inside `<Suspense>`.
  - Turbopack fails the build on an import of a file that doesn't exist (no optional imports).
  - Read `node_modules/next/dist/docs/` before writing Next code (`AGENTS.md`).
- **The shell is zsh:** `${!var}` doesn't work (it silently piped empty values into `vercel env add` once).
- **Stale `.next/types`** after deleting a route causes tsc errors: `rm -rf .next/types && npx next typegen`.
- **Scripts that import `lib/*`** need `npx tsx --env-file=.env.local --conditions=react-server <file>.mts` because of `server-only`.
- **Local dev against Whop sandbox:** `.claude/launch.json` config `dev-sandbox` on port 3100.

## Where things stand right now

- **The real $15 payment test passed** (2026-10-24, 15:57–15:58 UTC). Upload → production Whop checkout → real payment → signed webhook → payment re-fetched → order marked `paid` → decisions logged. The webhook marked it paid within about a second.
- **The test order stays on purpose: no refund, no delete.** It will be our first real end-to-end test with Terac reviewers.

  | Field | Value |
  |---|---|
  | Order | `b5a2985e-fbb6-4dd6-bcbb-4e4412a9a749` |
  | Status | `paid` |
  | Amount | 1500 cents |
  | Whop payment | `pay_J1xEzBcJINCx6i` |
  | Whop checkout | `ch_bdmcCQ9nLPmWGb9` |
  | Reviews | 0 of 3 |
  | Audience | `men_18_31_us` (made by the old age-range form; not a valid audience any more) |
  | Screenshots | 1 file in bucket `screenshots`, path in `screenshots.storage_path` for that order |
  | Decisions | 2 rows: `order/created`, `payment/paid`. (The three orphaned `order/created` rows with no order ID were deleted.) |

- **This order should reach Terac reviewers** once Terac is live. Its audience matches no panel, so it needs moving to `women_21_35_us` or `men_21_35_us` first; Haris will confirm which with the partner.
- Terac is down for about 2 hours (per the hosts). The partner is building the Terac side in mock mode, so going live only needs the key.
- Its only screenshot isn't a dating profile (the AI first read describes an AR room-scanning app over a desk). Reviewers would be rating a desk photo, so swap in real profile screenshots before the Terac run.
- **AI first read** (`lib/first-read.ts`): built and committed, **not deployed**. It needs `supabase/migrations/2026-10-24-first-read.sql` run first, because the webhook now sets `screening` and the order API reads `first_read_json`. Push only after that SQL has run. The full loop and its owners are in checklist.md, "The zero-human loop, end to end".
- **Everything is pushed**; the last commits on `main` are the two-audience change and this handoff. The live site has the two-audience form.

## Next action items

**Haris (Whop and customer side)**
1. ~~Run the real $15 test~~ (passed). Keep that order for the first Terac end-to-end test (above).
2. **Whop dashboard:**
   - confirm payouts and verification are finished so live payments settle (ask Whop staff);
   - set the store name and URL name, logo, banner and support email.
3. Marketplace is parked as "later" (see checklist.md). Haris is asking Whop staff whether it should be a Whop app instead.
4. Ask the organizers whether purchases by our own team count toward revenue.

**Partner (Terac)**
1. Get `TERAC_API_KEY` (organizers' Notion doc) and sign in to terac with `/mcp`. Run `npm run terac:tools` to get the real tool schemas and the cost per reviewer.
2. Launch the two panels (`women_21_35_us`, `men_21_35_us`) sized to the $100 of credits; start them paused if no paid orders are waiting.
3. Build `/review` and its API, `POST /api/agent/order-paid`, quality check and approval, `report_json` (confirm its shape with Haris), and screenshot deletion.

**Both**
- One real paid order end to end with no manual steps, then start selling.
- Record the 2-minute demo; show the decision log.

**After the event:** rotate the Anthropic, Supabase secret and Whop production keys (they were pasted into chat).
