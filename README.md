# Second Look

Real people review your dating profile. One standard review costs $15 and includes 3 independent reviewers. Built with React, TypeScript, Next.js App Router, and private Supabase Storage.

## Run locally

Use Node.js 22.13+ or a current supported LTS version.

```bash
npm ci
cp .env.example .env.local  # Only for a new checkout; do not overwrite existing credentials.
npm run dev
```

Open http://localhost:3000. Required upload settings:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY` — server secret or legacy service-role key; never exposed to the browser
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — browser-safe key

The existing database schema is in `supabase/schema.sql`. Do not rerun it against an already configured project. Storage requires a private `screenshots` bucket with a 10 MB file limit and support for PNG, JPEG, and WebP.

## What works

- Responsive landing page, pricing, FAQ, and clearly labeled illustrative report.
- `/order`: select or drop 1–10 screenshots; preview, reorder, and remove them; select audience; enter email and adult/profile-owner consent.
- Uploads go directly to private Supabase Storage using server-issued upload tokens. The server writes `orders` and `screenshots` rows and verifies actual image bytes before checkout.
- `/order/[id]`: protected order status, screenshots, payment handoff, and deletion of an unpaid draft without an active checkout. Access uses an HttpOnly cookie in the browser that created the order.
- `/dashboard`: password-protected live data for the latest 100 orders and 25 decisions. Set `DASHBOARD_PASSWORD` to enable sign-in.
- `/review`: interactive UI preview only; live assignment and submission integration belongs to the Terac backend.
- `/start`: a truthful placeholder until verified Whop purchase claiming is implemented. It does not unlock purchases by email alone.

## Integration status

Whop checkout uses the existing `lib/whop.ts` helper when the selected environment's API key, business ID, and `PUBLIC_BASE_URL` are set. The existing `/api/whop/webhook` remains unchanged. Live payments have not been exercised by the frontend upload tests.

Terac assignment, review processing, report generation, email notification, and automatic screenshot deletion after delivery are not implemented by this frontend change. The site does not claim these operations have completed. Keep live sales closed until fulfillment is verified end to end.

See `docs/frontend-integration.md` for route contracts and deployment details.

## Checks

```bash
npm run lint
npm run build
```

The upload integration was also exercised against Supabase with 10 synthetic images, invalid file/count requests, session isolation, private object access, and cleanup of all test objects and orders. Browser visual verification was unavailable because local browser access was declined.
