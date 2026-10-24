// One offer. Keep the existing "quick" database value to avoid a schema migration.
export const REVIEW_OFFER = {
  name: "Profile review",
  reviews: 3,
  priceUsd: 15,
} as const;
export const TIERS = { quick: REVIEW_OFFER } as const;
export type Tier = keyof typeof TIERS;

export function tierForAmount(usd: number): Tier | null {
  return usd === REVIEW_OFFER.priceUsd ? "quick" : null;
}

// The only reviewer audiences we sell. Each key must match a Terac panel (one always-open opportunity per audience).
export const AUDIENCES = {
  women_21_35_us: "Women, 21–35, US",
  men_21_35_us: "Men, 21–35, US",
} as const;
export type Audience = keyof typeof AUDIENCES;

export function isAudience(value: unknown): value is Audience {
  return typeof value === "string" && value in AUDIENCES;
}
