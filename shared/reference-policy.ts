import type { Policy } from "./policy.ts";

/**
 * The reference Policy: the one input every hash implementation asserts against. Its canonical
 * bytes and its Policy Hash are literals in `policy-hash.test.ts`, so changing this constant or
 * changing the encoder fails a test.
 *
 * Every USDC amount is an integer count of minor units, and USDC has six decimals. Nothing
 * downstream converts anything.
 *
 * Change a field and those two literals are stale. Bump `version` too.
 */
export const referencePolicy: Policy = {
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
  },
  tradeDown: { stars: 3, requiredDiscountPercentage: 30 },
  preferences: {
    refundable: 50_000_000,
    breakfastIncluded: 40_000_000,
  },
};

/**
 * `referencePolicy` with `overrides` merged over it, so a test states only the field it is about
 * and inherits a structurally complete Policy for everything else.
 *
 * Plain objects merge by key at every depth; every other value replaces. The return type is loose
 * because most callers pass a value the schema has to reject, and `policySchema.parse` takes
 * `unknown`. A caller that wants a valid Policy uses `referencePolicy` itself.
 */
export function makePolicy(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return merge(referencePolicy, overrides);
}

function merge(
  base: Record<string, unknown>,
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(overrides)) {
    const current = merged[key];

    merged[key] = isPlainObject(current) && isPlainObject(value) ? merge(current, value) : value;
  }

  return merged;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
