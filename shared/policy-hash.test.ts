import { test } from "node:test";
import assert from "node:assert/strict";

import { canonicalJson } from "./canonical-json.ts";
import { referencePolicy } from "./reference-policy.ts";
import { hashPolicy } from "./policy-hash.ts";

// The property that binds the buyer and the enclave together. If these two ever disagree, the
// settlement is rejected on chain and the auction dies in timeoutRefund.
//
// The two constants below are the commitment for the reference Policy. Changing either the Policy
// or the encoder changes them, which is the point: it must never happen by accident.

const CANONICAL =
  '{"currency":"USDC","hardRequirements":{"checkin":"2026-10-12","checkout":"2026-10-14",' +
  '"city":"Paris","minStars":4,"numberOfRooms":1,"roomType":"double"},' +
  '"maxPrice":520000000,"nights":2,' +
  '"preferences":{"breakfastIncluded":40000000,"refundable":50000000},' +
  '"tradeDown":{"requiredDiscountPercentage":30,"stars":3},"version":1}';

const POLICY_HASH = "0xc02246ea158658c8ee47f33d88f453046752a6cd63502f414449986c512a9902";

test("canonicalizes the reference Policy to the committed bytes", () => {
  assert.equal(canonicalJson(referencePolicy), CANONICAL);
});

test("hashes the reference Policy to the committed hash", () => {
  assert.equal(hashPolicy(referencePolicy), POLICY_HASH);
});

test("ignores key order in the input", () => {
  const reordered = {
    preferences: referencePolicy.preferences,
    tradeDown: referencePolicy.tradeDown,
    hardRequirements: referencePolicy.hardRequirements,
    nights: referencePolicy.nights,
    maxPrice: referencePolicy.maxPrice,
    currency: referencePolicy.currency,
    version: referencePolicy.version,
  };

  assert.equal(hashPolicy(reordered), POLICY_HASH);
});

test("changes the hash when any field changes", () => {
  const cheaper = { ...referencePolicy, maxPrice: referencePolicy.maxPrice - 1 };

  assert.notEqual(hashPolicy(cheaper), POLICY_HASH);
});
