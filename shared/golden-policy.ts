import type { Policy } from "./policy.ts";

/**
 * The Policy from `docs/spec.md`. Every test that needs a valid Policy uses this one, so a schema
 * change breaks a test rather than an auction.
 *
 * Every USDC amount is an integer count of minor units, and USDC has six decimals. Nothing
 * downstream converts anything.
 *
 * Change a field and the hash in `policy-hash.test.ts` is stale. Bump `version` too.
 */
export const goldenPolicy: Policy = {
  version: 1,
  currency: "USDC",
  maxPrice: 520_000_000,
  nights: 2,
  hardRequirements: {
    city: "Paris",
    checkin: "2026-10-12",
    checkout: "2026-10-14",
    minStars: 4,
    roomType: "double",
    numberOfRooms: 1,
    location: { name: "Gare du Nord", latitudeMicro: 48_880_900, longitudeMicro: 2_355_300 },
    radiusMeters: 2000,
  },
  tradeDown: { stars: 3, requiredDiscountPercentage: 30 },
  preferences: {
    refundable: 50_000_000,
    breakfastIncluded: 40_000_000,
  },
};
