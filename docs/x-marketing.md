# Daily X marketing

The Vercel cron at 16:00 UTC runs once per day (Hobby scheduling can vary within the hour). It drafts useful original copy with Claude, checks claims in a second call, verifies @secondlook_date through X, and posts a tracked product link. No DMs, replies, paid ads, customer images or private order data are used. This first version records posts and adds UTM attribution; it does not yet join purchases to campaigns or automatically optimize based on conversions.

## Setup

1. Sign into https://console.x.com/ as @secondlook_date and create a developer app. Enable OAuth 1.0a user authentication with **Read and Write** permissions (no DMs). Generate the account's Access Token and Secret after enabling write permissions. A standalone app Bearer Token cannot publish for a user. If the portal requires a website, use https://second-look-beta.vercel.app. This single-account token integration does not implement an OAuth callback or sign-in flow.
2. Save API Key / API Key Secret as `X_API_KEY` / `X_API_SECRET`, and Access Token / Access Token Secret as `X_ACCESS_TOKEN` / `X_ACCESS_TOKEN_SECRET`. Put them in ignored `.env.local` and Vercel Production, never browser-prefixed variables or source control. Set `X_ACCOUNT_ID` to the numeric user ID shown for the authorized account (or obtained from authenticated GET /2/users/me).
3. X API usage requires credits. Review current pricing at https://docs.x.com/x-api/getting-started/pricing and set a spending limit in the developer console. Claude generation/checking also consumes API usage. No credits or subscriptions are purchased by this code.
4. Run `supabase/migrations/2026-10-24-x-marketing.sql` in the Supabase SQL editor. The table is service-role only.
5. Configure existing `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ANTHROPIC_API_KEY`, and a strong `CRON_SECRET`. Set `X_MARKETING_ENABLED=true`, `X_MARKETING_PUBLISH_ENABLED=false`, and optionally `X_MARKETING_MODEL` (defaults to the project's existing Claude model).
6. Deploy. Authenticated POST `/api/cron/x-marketing` previews checked copy without publishing or consuming the daily slot. Send `Authorization: Bearer <CRON_SECRET>` from a trusted API client. GET executes the daily worker; with publishing disabled, inspect its saved draft in Supabase `marketing_posts`.
7. Once a draft is satisfactory, set `X_MARKETING_PUBLISH_ENABLED=true` in Production and redeploy. The next unused UTC daily slot will publish. Setting either flag to false and redeploying stops publication. Preview deployments and local GETs cannot publish.

The previous desktop X automation should stay paused; use only this Vercel scheduler.

## Reliability and inspection

`marketing_posts` stores text, the copy-check reason, state, timestamps, and X post ID. A unique account/day slot and SQL advisory lock prevent concurrent or repeated cron requests from publishing twice. Drafts and failures consume that day's slot; previews via POST do not. History helps avoid repetitive posts.

A network timeout or lost database write after starting publication leaves `posting` or `unknown`. Subsequent days are blocked deliberately: X has no idempotency key for this create call. Inspect @secondlook_date before resolving the row. If published, record its actual `post_id`, `posted_at`, and `state='posted'`; if you have confirmed it was not published, set `state='failed'`. Never blindly reset a pending publish. Inspect Vercel cron errors and this ledger for failures. A draft that fails factual checks is not posted; model checking is fallible, so review early outputs.

Tests: `node --test tests/x-marketing.test.mjs`. No real X posts are made by tests.
