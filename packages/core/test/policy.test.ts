import { test } from "node:test";
import assert from "node:assert/strict";

import { POLICY_VERSION, policySchema } from "../src/policy.ts";
import { usdcMinorUnits } from "../src/usdc.ts";

// The Policy in docs/spec.md, built through usdcMinorUnits so no test spells out the decimals.
function demoPolicy(): unknown {
  return {
    version: POLICY_VERSION,
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
      location: { name: "Gare du Nord", latitudeMicro: 48880900, longitudeMicro: 2355300 },
      radiusMeters: 2000,
    },
    tradeDown: { stars: 3, requiredDiscountPercentage: 30 },
    preferences: { refundable: usdcMinorUnits(50), breakfastIncluded: usdcMinorUnits(40) },
  };
}

function withoutField(field: string): Record<string, unknown> {
  const policy = demoPolicy() as Record<string, unknown>;
  delete policy[field];
  return policy;
}

test("accepts the policy from docs/spec.md", () => {
  assert.equal(policySchema.safeParse(demoPolicy()).success, true);
});

// An unknown key changes the canonical bytes and therefore the Policy Hash, so it cannot be
// quietly carried or quietly dropped.
test("rejects an unknown key", () => {
  assert.equal(policySchema.safeParse({ ...(demoPolicy() as object), extra: 1 }).success, false);
});

test("requires every field", () => {
  for (const field of [
    "version",
    "currency",
    "maxPrice",
    "nights",
    "hardRequirements",
    "tradeDown",
    "preferences",
  ]) {
    assert.equal(policySchema.safeParse(withoutField(field)).success, false, field);
  }
});

test("rejects a fractional amount", () => {
  const policy = demoPolicy() as Record<string, unknown>;
  policy["maxPrice"] = 520.5;

  assert.equal(policySchema.safeParse(policy).success, false);
});

test("rejects a maximum price of zero or less", () => {
  const policy = demoPolicy() as Record<string, unknown>;
  policy["maxPrice"] = 0;

  assert.equal(policySchema.safeParse(policy).success, false);
});

test("rejects null, which docs/adr/0003-canonical-encoding.md says a policy cannot carry", () => {
  const policy = demoPolicy() as Record<string, unknown>;
  policy["tradeDown"] = null;

  assert.equal(policySchema.safeParse(policy).success, false);
});

test("rejects a version it does not understand", () => {
  const policy = demoPolicy() as Record<string, unknown>;
  policy["version"] = POLICY_VERSION + 1;

  assert.equal(policySchema.safeParse(policy).success, false);
});

test("rejects a currency other than USDC", () => {
  const policy = demoPolicy() as Record<string, unknown>;
  policy["currency"] = "EUR";

  assert.equal(policySchema.safeParse(policy).success, false);
});

test("rejects a checkin date that is not an ISO calendar date", () => {
  const policy = demoPolicy() as { hardRequirements: Record<string, unknown> };
  policy.hardRequirements["checkin"] = "12/10/2026";

  assert.equal(policySchema.safeParse(policy).success, false);
});

test("rejects a checkout on or before the checkin", () => {
  const policy = demoPolicy() as { hardRequirements: Record<string, unknown> };
  policy.hardRequirements["checkout"] = policy.hardRequirements["checkin"];

  assert.equal(policySchema.safeParse(policy).success, false);
});

test("rejects a star rating outside one to five", () => {
  const policy = demoPolicy() as { hardRequirements: Record<string, unknown> };
  policy.hardRequirements["minStars"] = 6;

  assert.equal(policySchema.safeParse(policy).success, false);
});

// A trade-down at or above minStars is redundant, not invalid: docs/spec.md constrains the field
// no further, so rejecting it would fail an intent parse the spec permits.
test("accepts a trade-down at or above the minimum stars", () => {
  const policy = demoPolicy() as { tradeDown: Record<string, unknown> };
  policy.tradeDown["stars"] = 4;

  assert.equal(policySchema.safeParse(policy).success, true);
});

test("rejects a required discount outside nought to a hundred percent", () => {
  const policy = demoPolicy() as { tradeDown: Record<string, unknown> };
  policy.tradeDown["requiredDiscountPercentage"] = 101;

  assert.equal(policySchema.safeParse(policy).success, false);
});

test("rejects coordinates outside the globe", () => {
  const policy = demoPolicy() as { hardRequirements: { location: Record<string, unknown> } };
  policy.hardRequirements.location["latitudeMicro"] = 90_000_001;

  assert.equal(policySchema.safeParse(policy).success, false);
});

test("rejects a negative preference bonus", () => {
  const policy = demoPolicy() as { preferences: Record<string, unknown> };
  policy.preferences["refundable"] = -1;

  assert.equal(policySchema.safeParse(policy).success, false);
});
