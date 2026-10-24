import { validPaidReviewCount } from "./tiers";
import { decideProfileQuality, type QualityEvidence } from "./profile-quality";

export function assertRecruitable(order: {
  status: string; audience: string; review_target: number; whop_payment_id: string | null;
  paid_at: string | null; amount_cents: number | null; first_read_json: QualityEvidence;
}, positions: number[]) {
  if (order.status !== "paid" || !order.whop_payment_id || !order.paid_at) throw new Error("Order has not passed payment and screening");
  if (!validPaidReviewCount(order.amount_cents, order.review_target)) throw new Error("Payment does not match the review package");
  if (!["women_21_35_us", "men_21_35_us"].includes(order.audience)) throw new Error("Unsupported reviewer audience");
  if (positions.length > 10 || new Set(positions).size !== positions.length || decideProfileQuality(order.first_read_json, positions).status !== "paid") throw new Error("Screenshots have not passed quality checks");
}

export function opportunityInput(orderId: string, audience: string, projectId: string, baseUrl: string, token: string, reviews: number = 3) {
  if (!["women_21_35_us", "men_21_35_us"].includes(audience)) throw new Error("Unsupported reviewer audience");
  if (![1, 3].includes(reviews)) throw new Error("Unsupported reviewer count");
  const url = new URL("/review", baseUrl);
  if (url.protocol !== "https:") throw new Error("Public HTTPS base URL required");
  url.searchParams.set("order", orderId);
  url.searchParams.set("token", token);
  return {
    title: "Give constructive feedback on a dating profile",
    internal_title: `second-look:${orderId}`,
    description: "Review up to ten screenshots of an adult's dating profile. Give kind, specific feedback on photo choices and prompts. Do not save, share, or contact the profile owner. Non-sexual shirtless photos may appear. Your answers will be checked for useful, respectful feedback before payment.",
    project_id: projectId,
    num_participants: reviews,
    business_type: "b2c",
    customer_screening_review: "auto_invite",
    expected_days_to_complete: 5,
    filters: [
      { "integer--age": { $gte: 21, $lte: 35 } },
      { "multi_select--country": { $in: ["US"] } },
      { "multi_select--gender": { $in: [audience === "women_21_35_us" ? "female" : "male"] } },
    ],
    screening_questions: [{
      key: "dating_app_experience", text: "When did you most recently use a dating app to browse profiles?", pick: "one",
      answers: [
        { text: "Within the last month", qualify_logic: "may" },
        { text: "Within the last year", qualify_logic: "may" },
        { text: "More than a year ago", qualify_logic: "reject" },
        { text: "Never / none of these", qualify_logic: "reject" },
      ],
    }],
    tasks: [{ sequence: 1, task_type: "interview", review_type: "manual_review", duration_minutes: 5,
      task_url: url.toString(), title: "Review the profile", description: "Open the review page, examine every screenshot, and submit specific, respectful feedback. Return to Terac using the button after submitting." }],
  };
}

export type Opportunity = {
  id: string; status: string; num_participants: number;
  pricing?: { total_cost_cents: number; currency: string } | null;
  funding?: { affordable: boolean; draws_on_credit: boolean; balance_cents: number };
};
export function assertLaunchable(o: Opportunity, cap: number, reviews: number = 3) {
  if (o.status !== "draft" || o.num_participants !== reviews) throw new Error("Unexpected opportunity state or reviewer count");
  if (!o.pricing || o.pricing.currency !== "usd" || !Number.isSafeInteger(o.pricing.total_cost_cents) || o.pricing.total_cost_cents <= 0 || !Number.isSafeInteger(cap) || cap <= 0 || o.pricing.total_cost_cents > cap) throw new Error("Recruitment quote exceeds the configured budget or is unavailable");
  if (!o.funding?.affordable || o.funding.draws_on_credit || o.funding.balance_cents < o.pricing.total_cost_cents) throw new Error("Insufficient prepaid Terac credits");
}

// Terac normalizes singleton $in filters to $eq. Verify the persisted draft,
// including its private task URL, before any launch or retry.
export function assertOpportunityMatches(value: unknown, input: ReturnType<typeof opportunityInput>) {
  const o = value as Record<string, unknown>;
  if (!o || o.internal_title !== input.internal_title || o.project_id !== input.project_id || o.num_participants !== input.num_participants) throw new Error("Opportunity does not match this order");
  if (!Array.isArray(o.filters) || o.filters.length !== 3) throw new Error("Unexpected audience filters");
  const filters = Object.assign({}, ...o.filters) as Record<string, Record<string, unknown>>;
  const age = filters["integer--age"];
  const gender = input.filters[2]["multi_select--gender"]!.$in[0];
  const singleton = (slug: string, expected: string) => {
    const f = filters[slug];
    return f && Object.keys(f).length === 1 && (f.$eq === expected || (Array.isArray(f.$in) && f.$in.length === 1 && f.$in[0] === expected));
  };
  if (!age || Object.keys(age).length !== 2 || age.$gte !== 21 || age.$lte !== 35 || !singleton("multi_select--country", "US") || !singleton("multi_select--gender", gender)) throw new Error("Opportunity audience changed");
  const tasks = o.tasks as Record<string, unknown>[];
  if (!Array.isArray(tasks) || tasks.length !== 1 || tasks[0].task_type !== "interview" || tasks[0].review_type !== "manual_review" || tasks[0].duration_minutes !== 5 || tasks[0].task_url !== input.tasks[0].task_url) throw new Error("Opportunity task changed");
}
