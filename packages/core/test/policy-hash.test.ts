import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { canonicalJson } from "../src/canonical-json.ts";
import { policyHash } from "../src/policy-hash.ts";
import { policySchema } from "../src/policy.ts";
import { goldenPolicy } from "../src/golden-policy.ts";

// The property that binds the buyer and the enclave together. If these two ever disagree, the
// settlement is rejected on chain and the auction dies in timeoutRefund.

const golden = JSON.parse(
  readFileSync(new URL("../src/golden-policy.json", import.meta.url), "utf8"),
) as { policy: unknown; canonical: string; policyHash: string };

test("hashes the Policy from docs/spec.md to the value in the golden fixture", () => {
  assert.equal(policyHash(goldenPolicy), golden.policyHash);
});

test("canonicalizes the Policy to the bytes in the golden fixture", () => {
  assert.equal(canonicalJson(goldenPolicy), golden.canonical);
});

test("ships the same Policy in the fixture file as in the exported constant", () => {
  assert.deepEqual(golden.policy, goldenPolicy);
});

test("accepts the Policy from docs/spec.md against the schema", () => {
  assert.deepEqual(policySchema.parse(goldenPolicy), goldenPolicy);
});

test("ignores key order in the input", () => {
  const reordered = {
    preferences: goldenPolicy.preferences,
    tradeDown: goldenPolicy.tradeDown,
    hardRequirements: goldenPolicy.hardRequirements,
    nights: goldenPolicy.nights,
    maxPrice: goldenPolicy.maxPrice,
    currency: goldenPolicy.currency,
    version: goldenPolicy.version,
  };

  assert.equal(policyHash(reordered), golden.policyHash);
});

test("changes the hash when any field changes", () => {
  const cheaper = { ...goldenPolicy, maxPrice: goldenPolicy.maxPrice - 1 };

  assert.notEqual(policyHash(cheaper), golden.policyHash);
});

test("rejects a Policy the schema does not accept", () => {
  assert.throws(() => policySchema.parse({ ...goldenPolicy, maxPrice: 520.5 }));
  assert.throws(() => policySchema.parse({ ...goldenPolicy, currency: "EUR" }));
  assert.throws(() => policySchema.parse({ ...goldenPolicy, extra: 1 }));
});
