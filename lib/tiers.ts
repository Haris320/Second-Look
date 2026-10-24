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
