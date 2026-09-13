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
  '"maxPrice":6000000,"nights":2,' +
  '"preferences":{"breakfastIncluded":1000000,"refundable":2000000},' +
  '"tradeDown":{"requiredDiscountPercentage":60,"stars":3},"version":1}';

const POLICY_HASH = "0xe16c5121e33be22701344e1a5da54a1b52ca50fe065d53c3e15617bb2d822cc2";

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
