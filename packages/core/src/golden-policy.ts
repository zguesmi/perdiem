import type { Policy } from "./policy.ts";
import { usdcMinorUnits } from "./usdc.ts";

/**
 * The Policy from `docs/spec.md`, and the only Policy the fixture covers. The requisition service
 * and the enclave both assert against `golden-policy.json`, so a divergence between the two
 * encoders fails a test instead of an auction.
 *
 * Change a field and `golden-policy.json` is stale. Bump `version` and run
 * `pnpm --filter @perdiem/core generate:fixture`.
 */
export const goldenPolicy: Policy = {
  version: 1,
  currency: "USDC",
  maxPrice: usdcMinorUnits(520),
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
    refundable: usdcMinorUnits(50),
    breakfastIncluded: usdcMinorUnits(40),
  },
};
