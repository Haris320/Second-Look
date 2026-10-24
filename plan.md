# plan.md: Second Look build and sales plan

> Pricing update (2026-10-24): $15 for 1 reviewer (`quick`) or $40 for 3 reviewers (`full`), both with up to 10 screenshots. This supersedes older prices/counts below. Existing paid $15/3-review orders keep their original review target. Recruitment now creates one opportunity per order; see docs/terac-recruitment.md.

Companion to `CLAUDE.md`. About 6 hours, two people. Selling starts as soon as one real order works, not at the end.

## Who does what

| | Person A (backend + agent) | Person B (frontend + sales) |
|---|---|---|
| Owns | Whop webhook, Terac MCP agent, reviewer API, quality check, report | Next.js pages, Supabase tables and bucket, Whop listing, pricing copy, all marketing |
| Shared contract | The Supabase tables in CLAUDE.md. Agree on them in the first 20 minutes, then build in parallel. | |

## Hour 0: setup (both, about 45 minutes)

- [ ] **Terac:** get researcher access from the organizers. Install the MCP in Claude Code: `claude mcp add --transport http terac https://terac.com/api/mcp`, then `/mcp` to sign in. Run `terac_get_context` to see your balance and the guide for building an opportunity.
- [ ] **Ask Terac:** (1) cost per participant for a 5-minute consumer task, (2) how many credits you have, (3) how a server can use the MCP (which token works), (4) can you get a sandbox organization for testing.
- [ ] **Whop production:** create the business (or use the existing one), three products for the tiers, and an API key. Ask Whop staff how fast a new account can accept real payments.
- [ ] **Supabase:** create the tables from CLAUDE.md and a **private** storage bucket `screenshots`.
- [ ] **Next.js app:** `npx create-next-app@latest second-look --ts --tailwind --app`, push to GitHub, and deploy to Vercel right away so you have a public `https://` URL from the start. Fallback: `next dev` plus `cloudflared tunnel --url http://localhost:3000`.
- [ ] **Set prices** once you know Terac's cost per reviewer.

**Check:** Terac MCP answers in Claude Code; Whop shows your products; tunnel URL loads.

## Hour 1: the reviewer side (Person A)

- [ ] Reviewer page API: given `teracSubmissionId` and `audience`, return the oldest paid order for that audience still needing reviews, with signed screenshot URLs. Save answers on submit, then redirect to the Terac callback.
- [ ] Agent: launch one always-open opportunity per audience through the Terac MCP (settings in CLAUDE.md). Save IDs in `panels`.
- **Check:** each panel opportunity is active; opening the reviewer page link manually shows a test order.

## Hour 1: the customer side (Person B)

- [ ] Next.js pages: landing, `/order` (uploads to the private bucket, writes the order), `/start` for Whop buyers, `/order/[id]` results, `/review` UI matching Person A's API. Keep the styling plain.
- [ ] **Whop listing:** write the product page on Whop (title, description, example result image, the three tiers) and set its post-purchase link to `/start`.
- [ ] Write landing copy and three example results (use your own profile or a friend's, with their permission).
- **Check:** submitting the form creates an order with screenshots stored.

## Hour 2: money loop (both)

- [ ] Whop webhook marks orders `paid`. Get **Flow B** (pay on Whop → `/start` → upload) working first since it's simplest; add Flow A (upload → per-order checkout) only if time allows.
- [ ] Schedule `api/agent/tick` every minute (Vercel cron or a laptop loop).
- [ ] Agent loop every minute: read new submissions through the Terac MCP, quality-check them, approve or reject, update `reviews_done`, and generate the report when an order hits its target.
- **Check: one real paid order** (buy your own Quick Look) goes from payment to delivered report with no manual steps. **Start selling the moment this passes.**

## Hours 3–5: sell (Person B leads, Person A fixes and polishes)

- [ ] **Your own result as proof:** post it ("5 strangers rated my dating profile; here's what they said") on Instagram stories, LinkedIn, X, and group chats.
- [ ] **Direct messages:** friends, group chats, club members, anyone single you know. Offer a launch price for the first 10 orders.
- [ ] **Communities:** dating-app subreddits and Discords, following each community's self-promotion rules.
- [ ] **In person:** QR code on your laptop; the Whop staff and people around the building.
- [ ] **Whop marketplace:** the listing is live from hour 1; ask the Whop staff if they can feature or share it.
- [ ] Person A: report polish, dashboard metrics, decision log on screen, watch reviewer quality.

## Last 45 minutes: freeze

- No new features. Prepare the dashboard (revenue, orders, time to first review) and the 2-minute demo from CLAUDE.md. Rehearse twice. Record a backup video of one order going through.

## Cut list if behind (in order)

Rush tier → three-word "how you come across" → prompt rewrites → dashboard polish. Never cut: Whop payment, Terac reviewers, the report.

## Risks and fallbacks

| Risk | Fallback |
|---|---|
| Server can't connect to the Terac MCP | Server calls headless Claude Code (`claude -p`) with the MCP signed in |
| Reviewers slow to arrive | Widen the audience (any gender, wider age range), raise reviewer pay, sell the "any audience" panel |
| Whop per-order checkout metadata not working | Dashboard checkout link + match payment to order by email |
| Whop account can't take live payments yet | Ask Whop staff on site right away; this blocks revenue, so fix it first |
| A review is rude | Agent rejects it and requests another reviewer; never reaches the customer |
| Few sales by hour 4 | Drop the price, push the free-sample post harder, DM more people |
