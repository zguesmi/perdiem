/**
 * A supplier agent prices from a real signal and its own margin: it reads a live LiteAPI rate for
 * the auction's public requirements, then applies its rate plan. Three agents, three plans, three
 * different bids from the same market.
 */
export interface RatePlan {
  /** Which agent this is, for logs and configuration. */
  name: string;
  stars: number;
  distanceKm: number;
  refundable: boolean;
  breakfastIncluded: boolean;
  /** Percentage added to the base rate. May be negative, which is how the cheap bid gets cheap. */
  marginPercent: number;
}

/** The three plans behind the demo. Their prices are asserted in the tests. */
export const DEMO_RATE_PLANS: Record<"a" | "b" | "c", RatePlan> = {
  a: { name: "a", stars: 3, distanceKm: 0.5, refundable: true, breakfastIncluded: false, marginPercent: -18 },
  b: { name: "b", stars: 4, distanceKm: 0.7, refundable: false, breakfastIncluded: false, marginPercent: 0 },
  c: { name: "c", stars: 4, distanceKm: 1.0, refundable: true, breakfastIncluded: true, marginPercent: 10 },
};

/** Applies a rate plan to a base rate. Integer arithmetic; no floating point reaches a bid. */
export function priceFromRatePlan(_basePrice: number, _plan: RatePlan): number {
  throw new Error(
    "priceFromRatePlan is not implemented yet. See .scratch/build/01-policy-schema-and-scoring-formula.md",
  );
}
