import { test } from "node:test";
import assert from "node:assert/strict";

import { canonicalJson } from "./canonical-json.ts";
import { goldenPolicy } from "./golden-policy.ts";
import { policyHash } from "./policy-hash.ts";

// The property that binds the buyer and the enclave together. If these two ever disagree, the
// settlement is rejected on chain and the auction dies in timeoutRefund.
//
// The two constants below are the commitment for the Policy in `docs/spec.md`. Changing either the
// Policy or the encoder changes them, which is the point: it must never happen by accident.

const CANONICAL =
  '{"currency":"USDC","hardRequirements":{"checkin":"2026-10-12","checkout":"2026-10-14",' +
  '"city":"Paris","location":{"latitudeMicro":48880900,"longitudeMicro":2355300,' +
  '"name":"Gare du Nord"},"minStars":4,"numberOfRooms":1,"radiusMeters":2000,' +
  '"roomType":"double"},"maxPrice":520000000,"nights":2,' +
  '"preferences":{"breakfastIncluded":40000000,"refundable":50000000},' +
  '"tradeDown":{"requiredDiscountPercentage":30,"stars":3},"version":1}';

const POLICY_HASH = "0xcf8e8d0c8679bb6c91011ea5d77ef5f4e44efcce1846bec48aa1ddcc2235ea8c";

test("canonicalizes the Policy from docs/spec.md to the committed bytes", () => {
  assert.equal(canonicalJson(goldenPolicy), CANONICAL);
});

test("hashes the Policy from docs/spec.md to the committed hash", () => {
  assert.equal(policyHash(goldenPolicy), POLICY_HASH);
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

  assert.equal(policyHash(reordered), POLICY_HASH);
});

test("changes the hash when any field changes", () => {
  const cheaper = { ...goldenPolicy, maxPrice: goldenPolicy.maxPrice - 1 };

  assert.notEqual(policyHash(cheaper), POLICY_HASH);
});
