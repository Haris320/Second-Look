# Second Look

**Real strangers review your dating profile and tell you what to fix. Our AI agent finds them, checks their work, pays them, and delivers your report, with zero employees.**

- Live site: https://second-look-beta.vercel.app
- Repo: https://github.com/Haris320/Second-Look
- Whop Business ID: `biz_TTHTUhhUiv6lMQ`

## What it is

Most people never learn why their dating profile isn't working. Friends are too nice, and the apps don't tell you. Second Look sells honest, specific feedback from real people in the audience you're trying to attract.

A customer uploads screenshots of their own Hinge, Bumble or Tinder profile and picks who should review it ("Women, 21–35, US" or "Men, 21–35, US"). They pay **$15 for one reviewer** or **$40 for three**. Real people matching that audience rate the photos and prompts and suggest changes, and the customer gets a report on a private link. Results arrive the same day.

No one on our team touches an order. A Claude-powered agent runs the whole company loop: payment, safety screening, recruiting humans, checking their work, paying them, writing the report, notifying the customer and deleting the screenshots. Every decision it makes is written to a decision log with a one-line reason.

## How an order flows

1. **Upload and pay.** The customer uploads 1–10 screenshots straight to a private storage bucket, then pays through a **Whop checkout** created for that order.
2. **Payment confirmed.** Whop's signed webhook hits our server. We re-fetch the payment from the Whop API, match it to the order, and send the buyer a **Whop message** with their private results link.
3. **AI first read.** Claude checks that the screenshots really are a dating profile, with nothing explicit and no one underage. It also gives instant feedback, clearly labelled as AI. Anything unsafe is held, and anything that isn't a profile is sent back for re-upload. No human ever sees it.
4. **Recruit humans through Terac.** The agent creates and launches a **Terac opportunity** for this order through the **Terac MCP**: the right gender, ages 21–35, US, a screening question, a 5-minute task and manual review. A per-order budget cap is enforced before any credits are spent.
5. **Reviewers do the work.** Each Terac participant opens our private review page, studies the screenshots and answers: first impression, what works, what to change, and bio/prompt advice. Then they're sent back to Terac's completion callback.
6. **Quality check, then pay.** A **Terac webhook** tells us a submission is awaiting review. Claude grades it against the task: specific, grounded in these screenshots, actionable and respectful. The agent then **approves (the reviewer gets paid) or rejects (with quoted evidence)** through the Terac MCP. Uncertain cases are never paid or denied blindly; they're held.
7. **Report delivered.** When the order has all its approved reviews, Claude summarizes **only what the reviewers wrote**: overall impression, top fixes and prompt feedback. The customer also sees each reviewer's full answers. The order is marked done, the buyer gets a "results are in" Whop message, and the screenshots are deleted.
8. **Self-healing.** A reconcile job sweeps for every stall path: slow Terac responses, abandoned reviewer slots, held checks and missed webhooks. It recovers them safely and logs each fix. It never double-spends credits and never moves money on its own.

## How we use Terac

Terac is our entire workforce. The server connects to the **Terac MCP** (`https://terac.com/api/mcp`) with our organization API key and drives the full lifecycle of human work:

| Terac capability | What Second Look does with it |
|---|---|
| `terac_create_opportunity` + `terac_launch_draft_opportunity` | Launch one opportunity per paid order, targeted by structured filters (gender, age 21–35, US), with a screening question about recent dating-app use, `review_type: manual_review`, and a 5-minute task pointing at our private review page |
| `terac_get_opportunity` / `terac_list_opportunities` | Verify the draft before spending (price, reviewer count, our private task URL), enforce the per-order budget, and find drafts Terac finished creating after a slow response so we never pay for a duplicate |
| `terac_get_submission` / `terac_get_submissions` | Confirm each reviewer's identity and status before showing them a profile, and find finished or abandoned work during reconciliation |
| `terac_approve_submission` / `terac_reject_submission` | Pay good reviewers, or reject spam and filler with a category and verbatim evidence, after Claude's quality check |
| `terac_get_context` | Watch our credit balance; the agent logs a "credits low" alert so we can top up |
| Participant URL macros + completion callback | Terac appends `submissionId`/`taskId` to our task link; reviewers return via `https://terac.com/api/external/callback?...&result=completed` |
| Signed webhooks (`submission.status.change`) | Our fast path: verified with Terac's HMAC signature, stored in an idempotent event inbox, and processed immediately |

## How we use Whop

Whop is our storefront, payment processor and customer messaging channel:

| Whop capability | What Second Look does with it |
|---|---|
| **Checkout configurations** (`checkoutConfigurations.create`) | A checkout per order, with the order ID in metadata and a redirect back to the customer's private results page |
| **Payment webhooks** (`payment.succeeded`, verified with `unwrapWebhook`) | The trigger for everything; we re-fetch the payment (`payments.retrieve`) and trust only Whop's record, so a forged or replayed webhook can't create a paid order |
| **Support channels + messages** | The business messages each buyer on Whop: "payment received" with their private link, and "your results are in" |
| **Products** (`products.list` / `products.update`) | An emergency switch that hides our products and stops new checkouts if we ever can't fulfil orders |
| **Whop sign-in (OAuth)** | Anyone can sign in with Whop at `/refer` to get a referral link, without buying first |
| **Transfers, refunds, disputes** | $3 referral rewards paid by Whop transfer, with refund and dispute checks before any payout. Built and gated behind a feature flag, off until validated, because the agent never moves money without that switch. |

## How we use Claude

Claude (`claude-opus-5-5`, structured outputs) makes the judgment calls a person would otherwise make:

- **First read:** safety and relevance screening of uploaded screenshots, plus instant AI feedback labelled as AI.
- **Quality control:** grading each human review before Terac pays the reviewer, with strict rules. A negative opinion is not grounds for rejection; uncertainty is held, not rejected.
- **Report writing:** summarizing approved human reviews only. It never invents opinions, scores or reviewers, and every report records the IDs of the reviews it came from.
- **Marketing:** an `/insights` page the agent writes and refreshes from anonymized, aggregate patterns across approved reviews. It never uses customer text, screenshots or identities.

## Stack

- **Next.js 16** (App Router, TypeScript) on **Vercel**: one app for pages, API routes, webhooks and the agent.
- **Supabase**: Postgres (orders, reviews, recruitment jobs, quality jobs, webhook inbox, decision log) and a private storage bucket for screenshots. Row-level security is on, and only the server touches data.
- **Model Context Protocol SDK** for the Terac MCP; **Anthropic SDK** for Claude; **Whop SDK** for Whop.

## Trust and safety

- **Every review in a report maps to a real, approved Terac submission.** AI text is always labelled.
- **Adults only, own profile only:** checkboxes at upload, reviewers filtered 18+ (21–35), and the AI screens for minors and explicit content before any human sees anything.
- **Privacy:**
  - Screenshots sit in a private bucket and are shown only through short-lived signed links.
  - Order pages use unguessable private links, no-referrer and noindex, with lockout after repeated wrong keys.
  - Screenshots are deleted as soon as the report is delivered.
- **No hidden money movement:** the agent approves reviewer pay only through Terac's own flow. Refunds stay a human decision.

## The "zero-human" proof

Open the dashboard's decision log and you can watch the company run itself, one line per decision:
- order created
- payment confirmed
- buyer messaged
- first read passed
- reviewers recruited on Terac
- reviewer assigned
- review approved and paid (or rejected, with the reason)
- report delivered
- results message sent
- screenshots deleted
