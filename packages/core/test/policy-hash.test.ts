import { test } from "node:test";
import assert from "node:assert/strict";
import { keccak256, toBytes } from "viem";

import { canonicalJson } from "../src/canonical-json.ts";
import { policyHash } from "../src/policy-hash.ts";

// The property that binds the desk and the enclave together. If these two ever disagree, the
// settlement is rejected on chain and the auction dies in timeoutRefund.

test("hashes the canonical encoding of the policy", () => {
  const policy = { maxPrice: 520, nights: 2 };

  assert.equal(policyHash(policy), keccak256(toBytes(canonicalJson(policy))));
});

test("ignores key order in the input", () => {
  assert.equal(policyHash({ a: 1, b: 2 }), policyHash({ b: 2, a: 1 }));
});
