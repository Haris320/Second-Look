# $3 referral rewards

Prices stay $15 for one reviewer and $40 for three. Anyone can visit `/refer` from the homepage, sign in or create a Whop account, and get a public referral link without buying a review. Existing buyers can also find their link on their private order page. A friend opens it, creates an order within 30 days, and pays the usual price. The referrer earns $3 for that friend's first qualifying purchase. Self-referrals are allowed for a first purchase. The $3 comes from Second Look's revenue, not an extra customer charge.

## Enable

1. Run `supabase/migrations/2026-10-24-referrals.sql` in the Supabase SQL editor. This creates private referral profiles, purchase history, reward ledger, and atomic database functions; it adds two columns to orders. It does not change prices or existing orders.
2. Run `supabase/migrations/2026-10-24-open-referrals.sql` after the base referral migration. This allows first-purchase self-referrals; it does not rewrite historical rewards.
3. Deploy this code (including `vercel.json`). Set `REFERRALS_ENABLED=true` in Vercel. Keep `REFERRAL_PAYOUTS_ENABLED=false` until sandbox validation is complete.
4. Use the existing production Whop business/key and webhook secret. The key needs payment reads including buyer identity/email, refund/dispute reads, and balance transfer create/read permissions. Fund the business's Whop balance, allowing for any transfer fees. Live account permissions and fees have NOT been verified by the code tests.
5. On the existing `/api/whop/webhook` subscription, keep `payment.succeeded`; add the available refund/dispute lifecycle events and `transfer.created`, `transfer.completed`, `transfer.failed`. The handler accepts `refund.*` and `dispute.*` events and retrieves the authoritative resource before changing the ledger.
6. Set a strong `CRON_SECRET` in Vercel (reuse the existing value if already set). Vercel calls `/api/cron/referrals` daily using its bearer header. Set `REFERRAL_PAYOUTS_ENABLED=true` only after testing. Redeploy when changing environment variables.

Vercel Hobby permits daily cron jobs; this schedule is once per day at roughly noon UTC. Each run processes at most 20 rewards and stops starting work after three minutes. Backlogs carry forward. Unsettled/held payments and orders still awaiting screening defer payout. Pausing payouts preserves attribution and the ledger. Disabling referrals stops attribution, referral event processing, and payouts; use the payout flag alone for a money-only pause.

## Whop sign-in setup (no review purchase required)

Follow the [official Whop OAuth setup](https://whop.com/blog/add-user-authentication/) to create an app under Developers. In its OAuth settings, register this exact production redirect URI:

`https://second-look-beta.vercel.app/api/referrals/callback`

For local testing, register `http://localhost:3000/api/referrals/callback` on your sandbox app and use that origin for `PUBLIC_BASE_URL`. Enable the app permission `oauth:token_exchange`.

Add these server-only Vercel variables:

- `WHOP_CLIENT_ID`: OAuth client ID from the app, usually `app_…`.
- `WHOP_CLIENT_SECRET`: OAuth client secret, not your business `WHOP_API_KEY`.
- `REFERRAL_SESSION_SECRET`: separate random value of at least 32 characters (`openssl rand -hex 32`). Keep it stable; rotation logs referrers out.

Keep `PUBLIC_BASE_URL=https://second-look-beta.vercel.app` and `WHOP_ENVIRONMENT=production` for production. For sandbox, use sandbox OAuth credentials and `WHOP_ENVIRONMENT=sandbox`, matching the payment configuration. Redeploy after setting variables.

The homepage/hero/nav/footer link to `/refer` on mobile and desktop. Until flags and OAuth credentials are configured, the page explicitly says sign-up is coming soon. Once enabled, sign-in creates or reuses the user's unique referral profile, and `/refer` shows their link, pending/paid totals, refresh, sign-out, and a shortcut to use their own link.

Login uses PKCE, signed ID-token verification against Whop's key set, state/nonce checks, and authoritative userinfo matching. The encrypted HttpOnly session contains a referral profile ID and a display label, not provider tokens. It grants access to aggregate referral earnings only, never to orders or the team dashboard. The callback ignores browser-supplied recipient IDs. The full live OAuth flow still needs testing with configured credentials.

## Rules and privacy

- A Whop account is required to earn referral rewards. Verified Whop sign-in is sufficient; no purchase is required. There is no public endpoint to choose a recipient or change a payout destination.
- The destination is the referrer's verified Whop user ID from sign-in (or their verified payment for existing buyers). Rewards go to their Whop balance; withdrawal availability is controlled by Whop.
- The last valid referral link visited before order creation wins. A later visit cannot replace the order's saved attribution. Cookies last 30 days; no cross-device attribution without reopening the link. Private browsing or blocked cookies may prevent attribution.
- Marketplace purchases made directly on Whop cannot inherit this website cookie. Friends must use the website referral link and checkout. Marketplace buyers can become referrers after their payment is verified.
- One reward per referred Whop user. Self-referrals are eligible on a first purchase. Repeat purchases by a previously paid customer are excluded. Historical orders are checked by buyer ID/email; multiple accounts with unrelated emails can still evade these checks. This is not comprehensive identity/fraud detection.
- Hold is at least 30 days after the reward is recorded, then the next eligible daily run. It is our application policy, not an assertion about Whop's transfer holding period.
- Refunds/disputes cancel rewards before transfer initiation. A refund after initiation/payment marks `recovery_needed` for investigation, never automatically debits a user. A concurrent refund and outgoing transfer can still race across systems; recovery state preserves that fact.
- A provider-confirmed failed transfer becomes `needs_attention`. No new idempotence key is generated automatically. If a failed transfer later succeeds, its webhook or reconciliation updates the same record.
- Referral links expose no private order token, screenshots, email, buyer ID, or friend's details. Order-page referral totals use the existing order access checks; the standalone `/refer` earnings API uses the separate Whop referral session. All tables/functions are service-role only.
- Existing paid orders can sign in at `/refer` immediately; their `payment.succeeded` webhook can also be replayed after enabling to populate their order-page referral profile. Replays do not rerun screening or duplicate rewards.

## Verify in sandbox before enabling payouts

Use sandbox Whop keys/business, `WHOP_ENVIRONMENT=sandbox`, and a separate test deployment/database where possible. No live transfers were performed during implementation.

1. As person A with no orders, visit `/refer`, sign in through sandbox Whop, and copy the referral link. Confirm no payment is requested.
2. Open that link in another browser as customer B, upload screenshots, and buy either package. Confirm the checkout remains $15/$40. After the verified payment, A sees $3 pending and B gets their own link.
3. Replay B's payment webhook. Confirm one reward only. Buy again as B: no second reward. As A, follow your own link before creating your first order, pay, and confirm a $3 self-referral reward. Repeating A's purchase must not add another reward.
4. For sandbox fixtures ONLY, move the reward's `available_at` into the past and ensure screening passed. Invoke the cron with its bearer secret. Expect exactly one $3 Whop balance transfer. Repeat the request; expect no second transfer. Never bypass the hold on production rewards to test.
5. Test a refund before payout (canceled), processing transfer (still pending), and refund after payout (`recovery_needed`). Confirm webhook retries reconcile the same transfer.
6. Inspect `referral_rewards` in Supabase for `needs_attention`, `recovery_needed`, and `last_error`. These exceptions need investigation. This implementation does not claim the business is fully unattended in every failure case.

Local tests: `node --test tests/*.test.mjs`, `npm run lint`, `npm run build`. Financial tests use mocked Whop calls and real PostgreSQL semantics through PGlite; they do not validate live provider permissions or move real money.
