import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { canonicalJson } from "../src/canonical-json.ts";
import { POLICY_VERSION, policySchema, type Policy } from "../src/policy.ts";
import { policyHash } from "../src/policy-hash.ts";
import { usdcMinorUnits } from "../src/usdc.ts";

// The property that binds the buyer and the Enclave together. If these two ever disagree, the
// settlement is rejected on chain and the auction dies in timeoutRefund.
//
// Every expected value is read from the golden fixture. Nothing here recomputes one, because a
// test that recomputes its own expectation passes on both sides of a divergence.

interface Fixture {
  readonly policy: unknown;
  readonly canonicalJson: string;
  readonly policyHash: `0x${string}`;
}

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/policy-hash.json", import.meta.url), "utf8"),
) as Fixture;

/** The Policy in docs/spec.md, written out here so the fixture cannot drift from the spec. */
function specPolicy(): Policy {
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

/** Reverses key order at every depth. The encoding must not notice. */
function reorderDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reorderDeep);
  if (typeof value !== "object" || value === null) return value;

  const entries = Object.entries(value).reverse();
  return Object.fromEntries(entries.map(([key, nested]) => [key, reorderDeep(nested)]));
}

test("the fixture policy is the policy in docs/spec.md", () => {
  assert.deepEqual(fixture.policy, specPolicy());
});

test("the fixture policy is valid against the schema", () => {
  assert.equal(policySchema.safeParse(fixture.policy).success, true);
});

test("encodes the fixture policy to the fixture bytes", () => {
  assert.equal(canonicalJson(fixture.policy), fixture.canonicalJson);
});

test("hashes the fixture policy to the fixture hash", () => {
  assert.equal(policyHash(fixture.policy as Policy), fixture.policyHash);
});

test("ignores key order at every depth", () => {
  assert.equal(policyHash(reorderDeep(fixture.policy) as Policy), fixture.policyHash);
});

test("changes when any hashed field changes", () => {
  const nudged = { ...specPolicy(), nights: 3 };

  assert.notEqual(policyHash(nudged), fixture.policyHash);
});
