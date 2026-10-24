# Frontend integration

## Upload and order API

`POST /api/orders` accepts JSON:

```json
{
  "email": "customer@example.com",
  "audience": "women_21_35_us",
  "ownProfile": true,
  "adult": true,
  "files": [{ "name": "profile.png", "type": "image/png", "size": 123456 }]
}
```

Audience values come from `lib/uploads.ts`. There is one offer: $15 for 3 reviewers, defined in `lib/tiers.ts`. New orders use the existing `quick` database value for schema compatibility. The server ignores client-supplied tier, price, and reviewer count. Older unpaid drafts must be recreated before checkout.

The response contains `orderId`, `storageUrl`, and one `{path, token}` upload target per file, preserving file order. It sets a signed, HttpOnly `sl_order_<id>` cookie valid for seven days. Each path is random and bound to that order. The frontend uses `uploadToSignedUrl` with the publishable key; the secret key never reaches the client. Screenshots are not persisted in localStorage.

Limits are enforced in the client and server: 1–10 PNG/JPEG/WebP files, at most 10 MB each. The existing bucket enforces the file size ceiling. The completion check uses Sharp metadata to reject non-image bytes, animated images, and images over 40 megapixels. No compression or resizing is performed; originals are preserved.

`POST /api/orders/:id/complete` verifies every object. It does not mark the order paid. Retrying in the same upload tab preserves already completed uploads. After leaving the tab, missing uploads require deleting the unpaid draft and creating a new one.

`GET /api/orders/:id` returns safe order fields, short-lived signed screenshot URLs, and `checkoutReady`. It requires the order cookie. This is same-browser access, not account authentication or an email recovery system. Cross-device recovery needs a verified email link before launch.

`DELETE /api/orders/:id` removes storage objects and the cascading order/screenshot rows only when the order is unpaid and has no active Whop checkout.

`POST /api/orders/:id/checkout` verifies the session and image files, then calls the existing Whop helper. The webhook is responsible for payment state. Missing payment configuration returns 503 with a clear message; it never simulates successful payment.

Mutating routes check the request Origin. A persistent five-drafts-per-email-per-hour limit catches accidental repeated creation. This is not a comprehensive anti-abuse control: add shared IP/device rate limiting or a challenge before exposing public upload signing at scale. Abandoned drafts and their objects also need scheduled cleanup. Signed upload tokens remain valid for the storage provider's token lifetime.

## Supabase

The implementation uses the existing five tables without a migration. Table RLS remains enabled, and storage remains private. Do not grant anonymous table access or make the bucket public to integrate the frontend.

Screenshots live in `screenshots/<order UUID>/<random UUID>.<extension>`. Screenshot rows store a zero-based `position`. The `orders` row is `pending_payment` until the Whop webhook confirms payment.

`ORDER_SESSION_SECRET` is an optional independent HMAC secret. If absent, the server uses `SUPABASE_SERVICE_KEY` to sign order cookies. Rotating the signing secret invalidates existing sessions.

## Report rendering

The result view reads `orders.report_json` after `status=done`. Agree on this schema with the report generator:

```ts
type ProfileReport = {
  summary?: string;
  like_count?: number;
  review_count?: number;
  words?: string[];
  top_fixes?: { title: string; description: string }[];
  prompt_feedback?: string;
  prompt_rewrites?: string[];
};
```

Only actual report data is shown on real order pages. `/example` is explicitly illustrative. Photo ranking and richer reviewer quotes can be added when the report API contract is finalized.

## Reviewer and marketplace handoffs

`/review` currently shows a clearly labeled interactive preview with an illustration. It does not trust a bare Terac submission ID to expose customer screenshots and does not send completion callbacks. Connect it to the verified assignment API once available.

`/start` intentionally does not match an entered email to a paid order. Implement a verified purchase handoff or email verification before accepting marketplace buyers through this route.

## Vercel

Import the repository with the Next.js preset and repository root as the root directory. Set the four Supabase values listed in README in the intended environment, then redeploy; `NEXT_PUBLIC_*` values are embedded at build time.

Set `PUBLIC_BASE_URL` to the final HTTPS origin. Add `DASHBOARD_PASSWORD` and optionally `ORDER_SESSION_SECRET`. Add Whop environment settings when ready, then configure its webhook at `/api/whop/webhook` and validate sandbox payment behavior before live use. The frontend itself needs no Vercel cron.

The paid service is commercial usage; verify the hosting plan is eligible under Vercel's terms. No Vercel project or paid plan was provisioned by this change.
