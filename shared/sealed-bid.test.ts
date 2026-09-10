import { test } from "node:test";
import assert from "node:assert/strict";

import { x25519 } from "@noble/curves/ed25519.js";
import { privateKeyToAccount } from "viem/accounts";
import { verifyTypedData } from "viem";

import { BID_TYPES, bidCommitment, bidDomain, bidHash, bidMessage } from "./bid.ts";
import {
  GOLDEN_AUCTION_ID,
  GOLDEN_SALT,
  GOLDEN_SIGNER_KEY,
  VERIFYING_CONTRACT,
  goldenBid,
} from "./golden-bid.ts";
import { openSealedBid, sealBid } from "./sealed-bid.ts";

const enclavePrivateKey = x25519.utils.randomSecretKey();
const enclavePublicKey = x25519.getPublicKey(enclavePrivateKey);

const account = privateKeyToAccount(GOLDEN_SIGNER_KEY);

async function signedPayload() {
  const signature = await account.signTypedData({
    domain: bidDomain(VERIFYING_CONTRACT),
    types: BID_TYPES,
    primaryType: "Bid",
    message: bidMessage(goldenBid),
  });

  return { bid: goldenBid, salt: GOLDEN_SALT, signature };
}

test("round trips a bid, its salt and its signature", async () => {
  const payload = await signedPayload();
  const envelope = sealBid(payload, enclavePublicKey, GOLDEN_AUCTION_ID);

  assert.deepEqual(openSealedBid(envelope, enclavePrivateKey, GOLDEN_AUCTION_ID), payload);
});

test("opens to a payload whose signature and commitment both check out", async () => {
  const payload = await signedPayload();
  const envelope = sealBid(payload, enclavePublicKey, GOLDEN_AUCTION_ID);

  const opened = openSealedBid(envelope, enclavePrivateKey, GOLDEN_AUCTION_ID);

  assert.ok(
    await verifyTypedData({
      address: opened.bid.supplier,
      domain: bidDomain(VERIFYING_CONTRACT),
      types: BID_TYPES,
      primaryType: "Bid",
      message: bidMessage(opened.bid),
      signature: opened.signature,
    }),
  );

  assert.equal(
    bidCommitment(bidHash(opened.bid), opened.salt),
    bidCommitment(bidHash(goldenBid), GOLDEN_SALT),
  );
});

test("seals to a different envelope every time", async () => {
  const payload = await signedPayload();

  assert.notDeepEqual(
    sealBid(payload, enclavePublicKey, GOLDEN_AUCTION_ID),
    sealBid(payload, enclavePublicKey, GOLDEN_AUCTION_ID),
  );
});

test("refuses a tampered ciphertext", async () => {
  const envelope = sealBid(await signedPayload(), enclavePublicKey, GOLDEN_AUCTION_ID);
  envelope[envelope.length - 1] = (envelope.at(-1) ?? 0) ^ 1;

  assert.throws(() => openSealedBid(envelope, enclavePrivateKey, GOLDEN_AUCTION_ID));
});

test("refuses the wrong enclave key", async () => {
  const envelope = sealBid(await signedPayload(), enclavePublicKey, GOLDEN_AUCTION_ID);
  const stranger = x25519.utils.randomSecretKey();

  assert.throws(() => openSealedBid(envelope, stranger, GOLDEN_AUCTION_ID));
});

test("refuses a bid sealed for another auction", async () => {
  const envelope = sealBid(await signedPayload(), enclavePublicKey, GOLDEN_AUCTION_ID);
  const otherAuction = `0x${"b2".repeat(32)}` as const;

  assert.throws(() => openSealedBid(envelope, enclavePrivateKey, otherAuction));
});

test("refuses a truncated envelope", () => {
  assert.throws(() => openSealedBid(new Uint8Array(40), enclavePrivateKey, GOLDEN_AUCTION_ID));
});

test("stays under the relay's 16 KiB cap", async () => {
  const envelope = sealBid(await signedPayload(), enclavePublicKey, GOLDEN_AUCTION_ID);

  assert.ok(envelope.length < 16 * 1024, `envelope is ${envelope.length} bytes`);
});

test("refuses a bid that names another auction", async () => {
  // The envelope binds to the auction, the bid names one, and only this check makes the two agree.
  // Without it a supplier re-seals a bid signed for a past auction under an open one.
  const otherAuction = `0x${"b2".repeat(32)}` as const;
  const payload = await signedPayload();
  const envelope = sealBid(payload, enclavePublicKey, otherAuction);

  assert.throws(
    () => openSealedBid(envelope, enclavePrivateKey, otherAuction),
    /different auction/,
  );
});

test("refuses to seal a payload the enclave would drop", async () => {
  // `docs/spec.md` shows the salt inside the bid object. An agent written from that fails here
  // rather than silently, in a run where only a count is logged.
  const payload = await signedPayload();
  const withSaltInside = { ...payload, bid: { ...payload.bid, salt: GOLDEN_SALT } };

  assert.throws(() =>
    sealBid(withSaltInside as typeof payload, enclavePublicKey, GOLDEN_AUCTION_ID),
  );
});
