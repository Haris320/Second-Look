# CLAUDE.md: Second Look

> Pricing update (2026-10-24): one standard $15 review with 3 reviewers and up to 10 screenshots. This supersedes tiered pricing and review counts below. New orders retain the `quick` database value only for schema compatibility.

Working name: **Second Look**. Real people review your dating profile and tell you what's working, what isn't, and what to change. Results in about an hour.

- **Event:** Zero-Human Company Hackathon by Terac, Whop HQ, Brooklyn. Two-person team, about 6 hours left.
- **Winning condition:** the team that **makes the most money** wins.
- **The only two hard requirements:**
  1. **Use the Terac MCP on the server** to recruit and manage the human reviewers.
  2. **Use Whop to process payments.**
- Everything else is optional. Keep it simple; selling matters more than technical depth.

## The product in one paragraph

A customer uploads screenshots of their own dating profile (Hinge, Bumble, Tinder, any app), picks who should review it (for example, "women 22–30 in the US"), and pays on Whop. The agent sends the profile to real people matching that audience through the Terac MCP. Each reviewer spends about 3 minutes rating the photos and prompts and suggesting one change. The agent checks each review for quality, approves good reviewers so they get paid, and combines everything into a report: overall score, photo ranking, which prompts work, and the top three fixes. No one on the team touches an order.

## Golden rules

1. **Ship the money loop first:** pay on Whop → order created → Terac reviewers → report delivered. Nothing else until one real paid order completes.
2. **Every review is from a real person.** Claude summarizes and rewrites suggestions, but never invents reviews or scores. Each review in a report must map to a real Terac submission.
3. **The buyer's own profile only, adults only.** The upload form requires checkboxes: "This is my own profile" and "I am 18 or older." Reviewers are filtered to 18+.
4. **Privacy:** screenshots live in a private Supabase bucket, reviewers see them only through the review page, and files are deleted 7 days after delivery. Say this on the order page.
5. **No Hinge branding.** We're an independent service. Say "works with Hinge, Bumble, and Tinder profiles"; never use their logos or imply a partnership.
6. **Kind but honest.** Reviewer instructions ask for constructive feedback. The agent filters out insulting or abusive comments before anything reaches the customer, and rejects that submission.
7. **Never invent API shapes** for Terac or Whop. Use the Terac MCP's own tools and the current Whop docs. If unsure, check the docs or ask.
8. **Every agent decision is logged** to `decisions` with a one-line reason. It's the "zero-human" proof in the demo.
9. **Small and boring code.** No abstractions, no extra services.

## Stack

One Next.js app does everything. No separate backend.

| Layer | Choice |
|---|---|
| App | **Next.js** (App Router, TypeScript): pages plus API routes for webhooks and the agent |
| Styling | Tailwind, plain and clean. No design system needed |
| Database + files | Supabase: Postgres tables, private storage bucket for screenshots |
| Agent | Claude via the Anthropic API, connected to the **Terac MCP**, run from an API route on a 1-minute schedule |
| Human reviewers | **Terac MCP** (`https://terac.com/api/mcp`) |
| Payments | **Whop** (production account, real money), also listed on the Whop marketplace |
| Hosting | Vercel (gives the public HTTPS URL Terac and Whop need). Fallback: `next dev` plus a cloudflared tunnel |

## How the server uses the Terac MCP

The order worker runs a Claude agent that has the Terac MCP attached. The agent uses Terac's MCP tools (for example `terac_get_context`, `terac_list_opportunities`, `terac_launch_draft_opportunity`, `terac_get_submissions`, `terac_pause_opportunity`, plus whatever else the server lists) to launch, monitor, and manage reviewer tasks.

- **Preferred:** the Anthropic Messages API's MCP connector, passing the Terac MCP URL and an access token. Check the current Anthropic docs for the exact parameter and beta header, and ask Terac which token the MCP accepts from a server.
- **Fallback:** a small worker script on your laptop calls Claude Code headless (`claude -p "..."`), with the Terac MCP already added and signed in, every minute. This counts as the server using the Terac MCP and avoids token setup. (It can't run on Vercel, so run it locally next to the deployed site.)
- If an action has no MCP tool (for example, approving a submission), use the Terac REST API for that one call and note it in `decisions`.

## Reviewer panels (the speed trick)

Don't create a new Terac task per order. At setup, launch **one always-open opportunity per audience**, for example:

- `women_21_35_us`
- `men_21_35_us`
- (optional) `any_21_35_us`

Each opportunity's task link points to our reviewer page with the audience in the URL. When a reviewer arrives, the page gives them the **oldest paid order for that audience that still needs reviews**. Orders get reviewed as soon as people show up, instead of waiting for fresh recruiting.

Opportunity settings: `business_type: "b2c"`, filters for age 18+ and the target gender and country, one simple screening question, `review_type: "manual_review"` so the agent approves each review before the reviewer is paid, a duration of about 5 minutes, and a large participant count.

## The reviewer task (about 3 minutes)

The reviewer page shows the profile screenshots and asks:

1. First impression: would you like this profile? (Yes / Maybe / No)
2. Rate each photo 1–10, and pick the best and worst.
3. Which prompt answer works best? Which falls flat, and why?
4. One specific thing they should change.
5. In three words, how does this person come across?

On submit: save the answers, then redirect the reviewer to
`https://terac.com/api/external/callback?teracSubmissionId={id}&result=completed`.

## Quality check before paying a reviewer

The agent approves a submission only if: every question is answered, the review took at least 60 seconds, the written answers are specific (not "looks good"), and nothing is abusive. Otherwise it rejects the submission and the order gets another reviewer. Log every approval and rejection.

## The customer report

Generated when an order reaches its review count:

- **Like rate:** "7 of 10 would like your profile."
- **Photo ranking:** average score per photo, best photo to lead with, photo to cut.
- **Prompts:** which one works, which doesn't, with reviewers' own words quoted.
- **How you come across:** a word cloud or list of the three-word answers.
- **Top 3 fixes**, plus two suggested prompt rewrites from Claude, clearly labeled as AI suggestions.

## Pricing (set after checking Terac's cost per reviewer)

| Tier | Reviews | Price |
|---|---|---|
| Quick Look | 5 | $9 |
| Full Review | 10 + prompt rewrites | $19 |
| Rush | 10, prioritized | $29 |

Keep each price comfortably above Terac's cost per participant times the number of reviews.

## Data model (Supabase)

- `orders` (id, email, audience, tier, review_target, reviews_done, status pending_payment|paid|in_review|done, whop_payment_id, created_at, delivered_at)
- `screenshots` (id, order_id, storage_path, position)
- `reviews` (id, order_id, terac_submission_id, answers_json, duration_s, status pending|approved|rejected, created_at)
- `panels` (id, audience, terac_opportunity_id, status)
- `decisions` (id, order_id, step, choice, reason, created_at) ← shown live on the dashboard

Order status: `pending_payment → paid → in_review → done`.

## Whop payments (two ways in, one order system)

Production Whop account, since this must take real money. Create one product per tier in the Whop dashboard.

**Flow A, from our website: upload first, then pay.**
1. Customer uploads screenshots and picks audience and tier → we create an order with status `pending_payment`.
2. We send them to a Whop checkout for that tier, with the order ID attached (check Whop's Checkout Configurations API for metadata and `redirect_url`), redirecting back to `/order/[id]`.
3. The Whop payment webhook marks the order `paid`.

**Flow B, from the Whop marketplace: pay first, then upload.**
1. Customer finds the product on Whop and pays there.
2. The product's post-purchase link sends them to `/start`, where they enter the email they paid with.
3. We match it to the webhook payment by email, create the order as `paid`, and show the upload form.

If per-order metadata is slow to get working, use Flow B for everyone: it's simpler and still works.

Verify the Whop webhook signature as the docs describe. Listing on the Whop marketplace is a free extra sales channel, so write the listing like the landing page.

## Pages

1. **`/` Landing:** headline ("Find out what real people think of your dating profile"), three example results, pricing, FAQ (privacy, who reviews, how fast), "Get reviewed" button.
2. **`/order` Order:** upload 3–8 screenshots, choose audience and tier, two required checkboxes, email, then Whop checkout (Flow A).
3. **`/start`:** for Whop marketplace buyers (Flow B): enter email, then the upload form.
4. **`/order/[id]` Status and results:** "5 of 10 reviews in," then the report.
5. **`/review` Reviewer page:** the task Terac reviewers open.
6. **`/dashboard` (for the demo, password-protected):** orders, revenue, reviews in, median time to first review, live decision log.

## Repo layout

```
app/
  page.tsx                   # landing
  order/page.tsx             # upload + choose tier (Flow A)
  order/[id]/page.tsx        # status + report
  start/page.tsx             # Whop marketplace buyers (Flow B)
  review/page.tsx            # Terac reviewer task
  dashboard/page.tsx         # demo dashboard
  api/whop/webhook/route.ts  # payment -> order paid
  api/review/route.ts        # next order for reviewer; save answers; redirect to Terac callback
  api/agent/tick/route.ts    # every minute: Claude + Terac MCP checks submissions, approves/rejects, builds reports
lib/
  supabase.ts  whop.ts  agent.ts  report.ts  log.ts
```

Schedule `api/agent/tick` with a Vercel cron (every minute), or call it from a simple loop on your laptop.

## Env vars

| Variable | Where from |
|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `TERAC_API_KEY` / Terac MCP token | Terac organization settings, or from organizers |
| `WHOP_API_KEY` | Whop **production** dashboard → Developer |
| `WHOP_BIZ_ID` | `biz_…` from the dashboard URL |
| `WHOP_WEBHOOK_SECRET` | Whop webhook settings |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | Supabase → Project Settings → API (backend only) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase (safe for the browser) |
| `PUBLIC_BASE_URL` | Vercel or tunnel URL (`https://…`), needed for the reviewer page and webhooks |
| `DASHBOARD_PASSWORD` | Anything; protects `/dashboard` |

Never commit keys. Only `NEXT_PUBLIC_` variables may reach the browser; Whop, Anthropic, and Supabase secret keys stay in API routes.

## Demo script (2 minutes)

1. "Most people never find out why their dating profile isn't working. Friends are too nice, and apps don't tell you."
2. Show a finished report: "7 of 10 women would like this profile. Lead with photo 3, cut photo 5."
3. Show the dashboard: real orders, real revenue through Whop, time to first review.
4. Show the decision log: the agent launched panels, assigned reviewers, rejected a lazy review, approved and paid good ones, delivered reports.
5. "Zero employees. The agent finds the humans through Terac, checks their work, pays them, and delivers. We just sold it."
