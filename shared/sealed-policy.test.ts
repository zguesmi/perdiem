import { test } from "node:test";
import assert from "node:assert/strict";

import { x25519 } from "@noble/curves/ed25519.js";

import { envelopeInfo, seal } from "./envelope.ts";
import { hashPolicy } from "./policy-hash.ts";
import { REFERENCE_AUCTION_ID } from "./reference-bid.ts";
import { referencePolicy } from "./reference-policy.ts";
import { openSealedBid } from "./sealed-bid.ts";
import { openSealedPolicy, sealPolicy } from "./sealed-policy.ts";

const enclavePrivateKey = x25519.utils.randomSecretKey();
const enclavePublicKey = x25519.getPublicKey(enclavePrivateKey);

const policyHash = hashPolicy(referencePolicy);

test("round trips the policy the buyer committed to", () => {
  const envelope = sealPolicy(referencePolicy, enclavePublicKey, policyHash);

  assert.deepEqual(openSealedPolicy(envelope, enclavePrivateKey, policyHash), referencePolicy);
});

test("refuses a policy whose bytes changed in flight", () => {
  // What a swapped upload looks like: a well-formed envelope, sealed to the enclave under the
  // hash that is already on chain, holding a cheaper policy than the buyer committed to.
  const swapped = { ...referencePolicy, maxPrice: 10_000_000 };
  const envelope = sealPolicy(swapped, enclavePublicKey, policyHash);

  assert.throws(
    () => openSealedPolicy(envelope, enclavePrivateKey, policyHash),
    /does not hash to the committed policy hash/,
  );
});

test("refuses an envelope sealed under another policy hash", () => {
  const envelope = sealPolicy(referencePolicy, enclavePublicKey, hashPolicy({ other: true }));

  assert.throws(() => openSealedPolicy(envelope, enclavePrivateKey, policyHash), /invalid tag/);
});

test("does not open a bid envelope as a policy, nor a policy envelope as a bid", () => {
  // One identifier, one key, two domains. Neither ciphertext opens as the other.
  const asBid = seal(
    "{}",
    enclavePublicKey,
    envelopeInfo("perdiem/sealed-bid/v1", REFERENCE_AUCTION_ID),
  );
  const asPolicy = sealPolicy(referencePolicy, enclavePublicKey, REFERENCE_AUCTION_ID);

  assert.throws(
    () => openSealedPolicy(asBid, enclavePrivateKey, REFERENCE_AUCTION_ID),
    /invalid tag/,
  );
  assert.throws(
    () => openSealedBid(asPolicy, enclavePrivateKey, REFERENCE_AUCTION_ID),
    /invalid tag/,
  );
});
