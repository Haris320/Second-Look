# Automated recruitment through Terac MCP

A confirmed Whop payment ($15 for one reviewer or $40 for three reviewers) moves an order to screening. Once every screenshot passes the existing quality checks, `runFirstRead` marks it paid and directly calls recruitment inside the existing `after()` callback. No extra HTTP hop or cron is needed for a new successful order.

Existing paid $15/three-review orders keep three reviewers; new orders use the new packages. Old unpaid drafts must be recreated before opening a new checkout.

One order creates one Terac opportunity requesting **one or three** reviewers, matching the purchased package. This supersedes the old shared-panel design in plan.md/checklist.md. Supported audiences remain women or men, ages 21–35, US. Invalid/legacy audiences are held rather than silently widened. The MCP SDK connects to https://terac.com/api/mcp using the organization's API key. Creation, inspection, launch and participant verification all use MCP tools.

The task is a five-minute external review, with manual payment approval. A screener asks when the applicant last used a dating app; within the last year qualifies. Terac may run its own screening interview. The recruitment window is five calendar days (Terac's minimum); it is not a same-day turnaround guarantee. Existing “results by tonight” copy is not validated by this integration.

## Go live

1. Run `supabase/migrations/2026-10-24-recruitment.sql` in Supabase SQL Editor. It adds a private recruitment job table, participant IDs on reviews, and atomic claim/assignment/submission functions. Do not run the full schema again.
2. Deploy this code, including the real `/review` page, before enabling recruitment.
3. Set these Vercel environment variables and redeploy:
   - `TERAC_API_KEY`: the existing organization key (server-only).
   - `TERAC_PROJECT_ID=pk34oqiwm1kbd1msy0gpj6vn` (verified Second Look default project).
   - `PUBLIC_BASE_URL=https://second-look-beta.vercel.app`.
   - `TERAC_RECRUITMENT_ENABLED=true`.
   - `TERAC_MAX_ORDER_COST_CENTS`: total permitted recruitment cost per order, in USD cents. Local/example default is **1800**, additionally limited to **600 cents per selected reviewer** ($6 for one, $18 for three).
   - `CRON_SECRET`: a strong random secret if using the recovery endpoint. Normal new-order recruitment does not require this variable.
4. Verify `/review` is publicly reachable without Vercel deployment protection, while invalid task links cannot retrieve images. Keep Supabase service credentials and the Terac key private.
5. Existing waiting orders do not re-trigger screening automatically. Invoke the protected recovery route once per eligible paid order, oldest first. Confirm its audience and quality evidence first; old age-range audiences are deliberately rejected.

**Live draft validation (2026-10-24):** Terac accepted the three-reviewer women's audience template and estimated **$6 per person / $18 total**. This is Terac's machine estimate, not a guaranteed rate; every order is re-quoted. New pricing is $15 for one reviewer and $40 for three. The single-review cost has not been separately quoted; each real order is checked against its $6-per-reviewer spending limit before launch. No credits were spent during validation. One integration-validation draft remains in Terac; it uses a fake order and must not be launched.

## Request and assignment safety

- The server checks status paid, a Whop payment ID/date, an amount matching the one- or three-review package, supported audience, and current screenshot quality evidence before claiming a job. It checks the order again just before launch.
- The persisted draft's order/project, audience, task URL, duration, and manual approval mode must still match. Quotes must fit the configured cap and prepaid balance; credit/overdraft spending is rejected.
- A unique order row and atomic database function serialize duplicate callbacks. The opportunity ID is saved before launch. Existing active opportunities are reconciled, never relaunched.
- `/review` receives an order-specific random task token and Terac's participant submission ID. Before showing images, the server verifies through MCP that the submission belongs to the order's opportunity and is eligible. It checks payment and image quality again.
- An atomic assignment function limits access to the purchased number of slots and prevents one participant filling multiple slots. Feedback is saved once, with server-measured duration (minimum 60 seconds), before returning a fixed Terac completion callback. Ten-minute private image URLs are issued only after assignment; refreshing obtains new URLs.
- Answers use `{like, works, changes, prompts}`. Saved feedback remains pending. The feedback-quality worker now checks completed answers and approves/rejects through MCP when enabled; see `feedback-quality.md`. A completion callback by itself does not pay reviewers because tasks use manual_review. Terac may recruit replacements after rejection; assignment capacity excludes rejected reviews. Final report generation and customer notifications remain separate work.

## Recovery

`POST /api/agent/order-paid` with `Authorization: Bearer <CRON_SECRET>` and JSON `{ "orderId": "..." }` retries a paid order. Do not expose that secret in client code. Failures are recorded in `decisions` and `recruitment_jobs.last_error` when the database is available.

- `retryable` with an opportunity ID: retry inspects the same opportunity; it may launch only a matching draft under budget, or recognize a completed launch.
- `needs_attention` without an opportunity ID: creation may have succeeded but its response was lost. Find the draft via `internal_title = second-look:<order UUID>` in Terac. Reconcile the ID before changing state to retryable. Never clear the job and create again without checking.
- If a function was killed mid-call, its state may remain creating/preparing/launching. Inspect the remote opportunity first and reconcile manually. No expiring lease can accidentally create a second opportunity after a timeout.
- Orders already in_review should not be re-recruited. If launch state needs reconciliation after a reviewer has arrived, inspect Terac and update the existing job rather than making another recruitment request.

Run `node --test tests/*.test.mjs`, `npm run lint`, and `npm run build`. Tests use mocked MCP calls and a local Postgres-compatible PGlite instance; they do not recruit or pay real people. Live MCP draft creation verified the schema and filter IDs. Launch, actual reviewer completion, and Vercel execution still need a controlled production/sandbox check after deployment.
