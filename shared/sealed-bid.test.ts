import { test } from "node:test";
import assert from "node:assert/strict";

import { x25519 } from "@noble/curves/ed25519.js";
import { privateKeyToAccount } from "viem/accounts";
import { verifyTypedData } from "viem";

import { BID_TYPES, bidCommitment, bidDomain, bidHash, bidMessage } from "./bid.ts";
import {
  REFERENCE_AUCTION_ID,
  REFERENCE_SALT,
  REFERENCE_SIGNER_KEY,
  VERIFYING_CONTRACT,
  referenceBid,
} from "./reference-bid.ts";
import { openSealedBid, sealBid } from "./sealed-bid.ts";

const BOOKING_URL = "https://api.liteapi.travel/v3.0";
const BOOKING_API_KEY = "sand_00000000-0000-0000-0000-000000000000";

const enclavePrivateKey = x25519.utils.randomSecretKey();
const enclavePublicKey = x25519.getPublicKey(enclavePrivateKey);

const account = privateKeyToAccount(REFERENCE_SIGNER_KEY);

async function signedPayload() {
  const signature = await account.signTypedData({
    domain: bidDomain(VERIFYING_CONTRACT),
    types: BID_TYPES,
    primaryType: "Bid",
    message: bidMessage(referenceBid),
  });

  return {
    bid: referenceBid,
    salt: REFERENCE_SALT,
    signature,
    bookingUrl: BOOKING_URL,
    bookingApiKey: BOOKING_API_KEY,
  };
}

test("round trips a bid, its salt, its signature and its booking credentials", async () => {
  const payload = await signedPayload();
  const envelope = sealBid(payload, enclavePublicKey, REFERENCE_AUCTION_ID);

  assert.deepEqual(openSealedBid(envelope, enclavePrivateKey, REFERENCE_AUCTION_ID), payload);
});

test("opens to a payload whose signature and commitment both check out", async () => {
  const payload = await signedPayload();
  const envelope = sealBid(payload, enclavePublicKey, REFERENCE_AUCTION_ID);

  const opened = openSealedBid(envelope, enclavePrivateKey, REFERENCE_AUCTION_ID);

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
    bidCommitment(bidHash(referenceBid), REFERENCE_SALT),
  );
});

test("seals to a different envelope every time", async () => {
  const payload = await signedPayload();

  assert.notDeepEqual(
    sealBid(payload, enclavePublicKey, REFERENCE_AUCTION_ID),
    sealBid(payload, enclavePublicKey, REFERENCE_AUCTION_ID),
  );
});

test("refuses a tampered ciphertext", async () => {
  const envelope = sealBid(await signedPayload(), enclavePublicKey, REFERENCE_AUCTION_ID);
  envelope[envelope.length - 1] = (envelope.at(-1) ?? 0) ^ 1;

  assert.throws(() => openSealedBid(envelope, enclavePrivateKey, REFERENCE_AUCTION_ID));
});

test("refuses the wrong enclave key", async () => {
  const envelope = sealBid(await signedPayload(), enclavePublicKey, REFERENCE_AUCTION_ID);
  const stranger = x25519.utils.randomSecretKey();

  assert.throws(() => openSealedBid(envelope, stranger, REFERENCE_AUCTION_ID));
});

test("refuses a bid sealed for another auction", async () => {
  const envelope = sealBid(await signedPayload(), enclavePublicKey, REFERENCE_AUCTION_ID);
  const otherAuction = `0x${"b2".repeat(32)}` as const;

  assert.throws(() => openSealedBid(envelope, enclavePrivateKey, otherAuction));
});

test("refuses a truncated envelope", () => {
  assert.throws(() => openSealedBid(new Uint8Array(40), enclavePrivateKey, REFERENCE_AUCTION_ID));
});

test("stays under the relay's 16 KiB cap", async () => {
  const envelope = sealBid(await signedPayload(), enclavePublicKey, REFERENCE_AUCTION_ID);

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
  const withSaltInside = { ...payload, bid: { ...payload.bid, salt: REFERENCE_SALT } };

  assert.throws(() =>
    sealBid(withSaltInside as typeof payload, enclavePublicKey, REFERENCE_AUCTION_ID),
  );
});

test("keeps the booking credentials out of the bid hash", async () => {
  // They sit beside the bid for the same reason the salt does: a member the EIP-712 type does not
  // have cannot reach `hashStruct`, so no bid hash, commitment or signature moves.
  const withCredentials = {
    ...referenceBid,
    bookingUrl: BOOKING_URL,
    bookingApiKey: BOOKING_API_KEY,
  };

  assert.equal(bidHash(withCredentials as typeof referenceBid), bidHash(referenceBid));
});

test("refuses to seal a payload with no booking credentials", async () => {
  // The enclave cannot book without them, and it drops what it cannot book.
  const { bookingUrl, bookingApiKey, ...payload } = await signedPayload();

  assert.throws(() =>
    sealBid(
      payload as typeof payload & { bookingUrl: string; bookingApiKey: string },
      enclavePublicKey,
      REFERENCE_AUCTION_ID,
    ),
  );
});

test("never writes the api key into the envelope in the clear", async () => {
  const envelope = sealBid(await signedPayload(), enclavePublicKey, REFERENCE_AUCTION_ID);

  assert.ok(!Buffer.from(envelope).includes(BOOKING_API_KEY));
});
