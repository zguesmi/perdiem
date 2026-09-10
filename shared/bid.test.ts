import { test } from "node:test";
import assert from "node:assert/strict";

import { privateKeyToAccount } from "viem/accounts";
import { verifyTypedData } from "viem";

import {
  BID_TYPES,
  bidCommitment,
  bidDigest,
  bidDomain,
  bidHash,
  bidMessage,
  bidSchema,
  bidsRoot,
} from "./bid.ts";
import { goldenBid, GOLDEN_SALT, GOLDEN_SIGNER_KEY, VERIFYING_CONTRACT } from "./golden-bid.ts";
import { ARC_CHAIN_ID } from "./chain.ts";

const ZERO = `0x${"00".repeat(32)}` as const;

test("hashes the bid struct without the salt", () => {
  // The salt is not a member of the type, so a hash computed with it in scope must not move.
  const withSalt = { ...goldenBid, salt: GOLDEN_SALT };

  assert.equal(bidHash(withSalt as typeof goldenBid), bidHash(goldenBid));
});

test("changes the bid hash when any signed field changes", () => {
  const cheaper = { ...goldenBid, price: goldenBid.price - 1 };

  assert.notEqual(bidHash(cheaper), bidHash(goldenBid));
});

test("binds the digest to the deployment", () => {
  const other = "0x00000000000000000000000000000000000000ff" as const;

  assert.notEqual(bidDigest(goldenBid, other), bidDigest(goldenBid, VERIFYING_CONTRACT));
});

test("pins the domain to Arc and the SealedAuction address", () => {
  assert.deepEqual(bidDomain(VERIFYING_CONTRACT), {
    name: "Perdiem",
    version: "1",
    chainId: ARC_CHAIN_ID,
    verifyingContract: VERIFYING_CONTRACT,
  });
});

test("signs a digest a verifier accepts", async () => {
  const account = privateKeyToAccount(GOLDEN_SIGNER_KEY);
  const signature = await account.signTypedData({
    domain: bidDomain(VERIFYING_CONTRACT),
    types: BID_TYPES,
    primaryType: "Bid",
    message: bidMessage(goldenBid),
  });

  assert.ok(
    await verifyTypedData({
      address: goldenBid.supplier,
      domain: bidDomain(VERIFYING_CONTRACT),
      types: BID_TYPES,
      primaryType: "Bid",
      message: bidMessage(goldenBid),
      signature,
    }),
  );
});

test("changes the commitment when the salt changes", () => {
  const hash = bidHash(goldenBid);
  const otherSalt = `0x${"ab".repeat(32)}` as const;

  assert.notEqual(bidCommitment(hash, otherSalt), bidCommitment(hash, GOLDEN_SALT));
});

test("roots the empty commitment set at bytes32(0)", () => {
  assert.equal(bidsRoot([]), ZERO);
});

test("roots commitments in arrival order, not sorted order", () => {
  const a = `0x${"01".repeat(32)}` as const;
  const b = `0x${"02".repeat(32)}` as const;

  assert.notEqual(bidsRoot([b, a]), bidsRoot([a, b]));
});

test("hashes a bid whose supplier address is not checksummed", () => {
  // A Circle wallet address arrives lowercased often enough that a throw here would look like a
  // signing bug rather than a formatting one.
  const lowercased = { ...goldenBid, supplier: goldenBid.supplier.toLowerCase() as `0x${string}` };

  assert.equal(bidHash(lowercased), bidHash(goldenBid));
});

test("rejects a room count that does not fit the uint8 it is signed as", () => {
  // Unbounded, this throws inside viem instead, which drops the whole enclave run rather than one
  // bid.
  assert.equal(bidSchema.safeParse({ ...goldenBid, numberOfRooms: 300 }).success, false);
});
