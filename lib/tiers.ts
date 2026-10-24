// Prices and review counts in one place. Update when the new CLAUDE.md pricing lands.
export const TIERS = {
  quick: { name: "Quick Look", reviews: 5, priceUsd: 9 },
  full: { name: "Full Review", reviews: 10, priceUsd: 19 },
  rush: { name: "Rush", reviews: 10, priceUsd: 29 },
} as const;

export type Tier = keyof typeof TIERS;

// Must match the Terac panels (one always-open opportunity per audience).
export const AUDIENCES = {
  women_21_35_us: "Women 21–35 in the US",
  men_21_35_us: "Men 21–35 in the US",
} as const;

export type Audience = keyof typeof AUDIENCES;

// Flow B buyers pay on the Whop marketplace without an order, so the tier comes from the amount paid.
export function tierForAmount(usd: number): Tier | null {
  const match = (Object.keys(TIERS) as Tier[]).find((tier) => TIERS[tier].priceUsd === usd);
  return match ?? null;
}
