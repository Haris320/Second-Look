# Terac webhook

Production endpoint: `POST https://second-look-beta.vercel.app/api/terac/webhook`

## Deployment

1. Run `supabase/migrations/2026-10-24-terac-webhooks.sql` in the Supabase SQL Editor. This adds a private event inbox, external-status columns on reviews, and a service-role-only transaction function.
2. Set `TERAC_WEBHOOK_SECRET` in Vercel, plus the existing `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`. The API key is not needed to receive events.
3. Deploy. Subscribe to `submission.status.change` (covers approvals too). `submission.approved` is also supported, but subscribing to both produces two separate deliveries for each approval.
4. Confirm/test the subscription in Terac. Signed `webhook.ping` requests return 200 without a database write. A successful ping verifies connectivity and signing, not the database migration; test a sandbox submission to verify persistence too.

## Behavior

Uses Terac's documented literal-secret HMAC-SHA256 over timestamp + raw body, constant-time comparison, and a five-minute timestamp tolerance. Invalid signatures return 401; malformed events return 400; missing configuration or database failure returns 503 for retry. Request bodies are limited to 256 KiB.

A successful event delivery means the event is durably stored. The database transaction deduplicates `event_id` and updates `reviews.terac_status` only when the event is newer. Events arriving before review assignment stay in the inbox. RLS denies browser access. No customer profile images are stored in the inbox.

**Feedback worker:** `awaiting_review`, `approved`, and `rejected` events now invoke the AI feedback-quality worker after durable storage, including duplicate deliveries that need retry. See `feedback-quality.md` for the additional migration and activation flag. Intermediate status events are marked processed without AI calls. Errors return 503 so Terac retries; uncertain decisions remain pending with a needs_attention audit entry. Final report generation is separate and not yet implemented.

Source: https://terac.com/docs/developers/guides/webhooks

Tests: `node --test tests/terac-webhook.test.mjs`
