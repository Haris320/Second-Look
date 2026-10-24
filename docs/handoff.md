# Second Look: handoff summary (2026-10-24, 19:15 UTC)

Context for an agent or teammate picking this up. No secret values appear here; keys live only in `.env.local` (gitignored) and Vercel.

Start with `git pull`. Then read `checklist.md` (decisions and the order lifecycle), `README.md` (what it does and how it works), and "Where things stand" below.

## Links

- **Repo:** https://github.com/Haris320/Second-Look (public, branch `main`; Vercel auto-deploys every push)
- **Live site:** https://second-look-beta.vercel.app (the `haris320s-projects.vercel.app` URL is behind a Vercel login; don't use it)
- **Vercel:** team `haris320s-projects`, project `second-look`; the CLI is logged in locally
- **Supabase:** project `ulduttuvjifeakriyqre`; private bucket `screenshots`
- **Terac:** org "Second Look" (`second-look-mvmn58xe`), project `pk34oqiwm1kbd1msy0gpj6vn`; dashboard https://terac.com/second-look-mvmn58xe/opportunities; webhook subscription `r8lzuzvofb3g0wu7lr031qqf` → `/api/terac/webhook` (confirmed, delivering)
- **Whop:** business `biz_TTHTUhhUiv6lMQ`, production

## The loop, as it runs today

upload → per-order Whop checkout ($15 = 1 reviewer `quick`, $40 = 3 reviewers `full`) → signed `payment.succeeded` webhook → `screening` → AI first read → `paid` (or `needs_reupload` / `held`) → "payment received" Whop message → `recruitOrder` creates and launches **one Terac opportunity per order** via MCP ($6 per reviewer, $18 for three; cap `TERAC_MAX_ORDER_COST_CENTS`) → reviewer opens `/review` from Terac (`review/assigned`, order `in_review`) → submits (`review/submitted`) → redirected to Terac's completion callback → Terac webhook `awaiting_review` → `processFeedback`: Claude grades, approves or rejects via MCP (`review_quality/approved|rejected|needs_attention`), `reviews_done` counts approved → the approval that reaches `review_target` runs `deliverReportIfComplete` (`report/delivered`) → status `done`, `report_json`, `delivered_at` → "results are in" Whop message (`notify/results_sent`) → screenshots deleted (`privacy/deleted`).

Safety net: `POST /api/agent/reconcile` (Bearer `CRON_SECRET`), **self-triggering since 19:38 UTC**: every inbound event kicks it, a heartbeat row in `decisions` deduplicates to one pass per 100 s, and each pass re-kicks itself about every 2 minutes while any order is open (verified: heartbeat advancing on its own across three deploys; `cb3b34c5` adopted its late draft and parked on credits without anyone running anything). Nothing runs on a laptop; the daily Vercel cron and `scripts/reconcile-loop.mjs` only restart the chain. See README "Recovery".

## Where things stand

**Proven with real money today:** payment, webhook, "payment received" message, first read, recruitment launch (five live opportunities), a Terac reviewer passing the screener and opening `/review` (assignment row created), Terac webhooks arriving (`screened_out` event stored and processed).

**Not yet observed on a real order:** a reviewer submitting → quality check → report → results message → deletion. All code paths are built and unit-tested with mocks; the first real submission will prove them. Watch `decisions` for `review/submitted`, then `review_quality/*`, then `report/delivered`.

**Credits are the blocker right now.** Terac balance was $10 at 19:08 UTC after five $18 launches; orders paid after that cannot launch (quote $18, `funding.affordable=false`, shortfall $8). Top up at https://terac.com/second-look-mvmn58xe/settings/finance. Once topped up, reconcile launches waiting orders by itself (retry every 15 minutes), or run `POST /api/agent/order-paid {orderId}` to do one immediately.

### Orders (19:10 UTC)

| Order | Paid | Audience | Status | Terac opportunity | Notes |
|---|---|---|---|---|---|
| `b5a2985e` | $15 (Haris, `pay_J1xEzBcJINCx6i`) | women | `needs_reupload` | none | Team test; marked `manual/test_order` so the dashboard excludes it. **Never recruits** (not `paid`). Delete with its files/rows once Haris confirms the refund |
| `37a9e977` | $40 | women | `in_review` 0/3 | `myxikijehpie66z5c7tp2rtg` active | Reviewer `oxfmimq…` in progress since 18:32, no submit yet |
| `65445aac` | $40 (Haris's own account; no Whop messages possible) | men | `paid` | `zic2xg7ualu1egd18p6set0c` active | 1 screener pass, nobody started |
| `2b29b421` | $40 | women | `paid` | `p2gv41mw4nbj3txvof70nqw4` active | |
| `98bf976e` | $40 | men | `paid` | `hmysgcnkrntyh51hlshzimzx` active | |
| `5408387a` | $40 | women | `paid` | `obu3j71z09ihh193mnr44s99` active | First create timed out; job reset by hand (`manual/recruitment_reset`) and relaunched. Orphan draft `afvy1ehep90zbzn05fj1gzto` (old token) can be deleted in Terac; it costs nothing |
| `cb3b34c5` | $40 | ? | `paid` | `wsg80l6kd12uezh9ruuo80mx` (draft, adopted 19:47) | Waiting on credits (`retryable`, retried every 15 min; launches by itself once the balance covers $18). Five older orphan drafts for this order exist on Terac from timed-out creates; they cost nothing |
| two `pending_payment` drafts | | | | | Customers who didn't finish checkout |

Also in Terac: draft `lkqmiqme8nzufrvznvqx2wy2` (integration validation, fake order). Must not be launched; safe to delete.

## Known issues and gaps

- **Terac `terac_create_opportunity` often exceeds 90 s** (two of six creates today). Recruitment handles it (late-draft adoption in `recruitOrder`, and reconcile's `recoverLostCreate` after 6 minutes), but a 300 s `after()` in the Whop webhook can still be killed mid-create; reconcile covers that too (`recruitment/stuck` after 10 min).
- **Rejected reviews:** Terac docs say it "may recruit a replacement"; the slot is freed locally (`assign_terac_review` ignores rejected rows) so the next Terac reviewer fills it. If Terac doesn't send another reviewer, the order stalls at N-1; reconcile flags nothing for this yet. Fallback: a human bumps `num_participants` or launches a new opportunity (spends credits; Haris's call).
- **`review_quality/needs_attention`** holds are surfaced by reconcile (`review_quality/still_held`, hourly) but need a human to inspect `feedback_quality_jobs` and either approve/reject in the Terac dashboard or reset the job.
- **`terac_list_opportunities` omits `internal_title`**; anything matching an order to a Terac opportunity must `terac_get_opportunity` each candidate (fixed in `recoverLostCreate`; before the fix it created a new draft every cycle).
- **Someone else's in-progress change** landed in commit `d0f0c7e` by accident (it was uncommitted in the shared checkout): `/api/orders/[id]` now returns approved reviews while an order is in progress and `components/order-status.tsx` shows them. It typechecks and only shows `status = approved` rows; review it if it wasn't meant to ship.
- **Whop messages to the business owner fail** ("recipient is the bot owner"); expected for Haris's own orders.
- Terac's `terac_get_submissions` list and `submission_stats` lagged behind `terac_get_submission` for the in-progress reviewer; reconcile checks pending local reviews individually for that reason.
- `/start` (marketplace buyers) is a placeholder; see checklist "Marketplace" for the proposed design.
- Delivery promise is "by tonight" everywhere; Terac's recruitment window is 5 days. Real turnaround is unknown until the first submissions land.

## Env (names only)

Set in Vercel production and `.env.local`: `ANTHROPIC_API_KEY`, `TERAC_API_KEY`, `TERAC_MCP_TOKEN`, `TERAC_PROJECT_ID`, `TERAC_WEBHOOK_SECRET`, `TERAC_RECRUITMENT_ENABLED=true`, `TERAC_MAX_ORDER_COST_CENTS=1800`, `FEEDBACK_REVIEW_ENABLED=true`, `WHOP_ENVIRONMENT=production`, `WHOP_API_KEY`, `WHOP_BIZ_ID`, `WHOP_WEBHOOK_SECRET`, `WHOP_SANDBOX_*`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `PUBLIC_BASE_URL`, `DASHBOARD_PASSWORD`, `CRON_SECRET`, `ORDER_LINK_SECRET`, `ORDER_SESSION_SECRET`. `REFERRALS_ENABLED` is unset on purpose (no payouts).

## Gotchas

- Next 16.4 with Cache Components: read `node_modules/next/dist/docs/` first; `useParams()` in client pages needs `<Suspense>`; Turbopack fails on imports of missing files.
- zsh: `${!var}` doesn't work.
- `node --test tests/*.test.mjs` needs `npm install` (PGlite is a dev dependency). Tests mock MCP and never recruit or pay.
- Terac MCP tool arguments are camelCase (`opportunityId`, `submissionId`, `projectId`).
- Terac webhook deliveries time out after 10 s; the webhook now stores the event and grades in `after()`.

## After the event

Rotate the Anthropic key, Supabase service key, Whop API key and both webhook secrets; they were pasted into chat during the build.
