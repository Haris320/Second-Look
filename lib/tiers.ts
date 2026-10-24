// Existing database tier keys; no pricing schema change required.
export const TIERS = {
  quick: { name: "One reviewer", reviews: 1, priceUsd: 15 },
  full: { name: "Three reviewers", reviews: 3, priceUsd: 40 },
} as const;
export type Tier = keyof typeof TIERS;
export function isTier(value: unknown): value is Tier {
  return value === "quick" || value === "full";
}
export function tierForAmount(usd: number): Tier | null {
  return usd === 15 ? "quick" : usd === 40 ? "full" : null;
}
export function matchesCurrentPackage(tier: unknown, reviews: number) {
  return isTier(tier) && TIERS[tier].reviews === reviews;
}
// Honor previously sold $15 / three-review orders; never downgrade their target.
export function expectedOrderCents(tier: unknown, reviews: number): number | null {
  if (tier === "quick" && reviews === 3) return 1500;
  return matchesCurrentPackage(tier, reviews) ? TIERS[tier as Tier].priceUsd * 100 : null;
}
export function validPaidReviewCount(amount: number | null, reviews: number) {
  return (amount === 1500 && (reviews === 1 || reviews === 3)) || (amount === 4000 && reviews === 3);
}

export const AUDIENCES = {
  women_21_35_us: "Women, 21–35, US",
  men_21_35_us: "Men, 21–35, US",
} as const;
export type Audience = keyof typeof AUDIENCES;
export function isAudience(value: unknown): value is Audience {
  return typeof value === "string" && Object.hasOwn(AUDIENCES, value);
}
