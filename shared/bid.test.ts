import { test } from "node:test";
import assert from "node:assert/strict";

import { privateKeyToAccount } from "viem/accounts";
import { keccak256, toHex, verifyTypedData } from "viem";

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
import {
  referenceBid,
  REFERENCE_SALT,
  REFERENCE_SIGNER_KEY,
  VERIFYING_CONTRACT,
} from "./reference-bid.ts";
import { ARC_CHAIN_ID } from "./chain.ts";

const ZERO = `0x${"00".repeat(32)}` as const;

test("hashes the bid struct without the salt", () => {
  // The salt is not a member of the type, so a hash computed with it in scope must not move.
  const withSalt = { ...referenceBid, salt: REFERENCE_SALT };

  assert.equal(bidHash(withSalt as typeof referenceBid), bidHash(referenceBid));
});

test("changes the bid hash when any signed field changes", () => {
  const cheaper = { ...referenceBid, price: referenceBid.price - 1 };

  assert.notEqual(bidHash(cheaper), bidHash(referenceBid));
});

test("binds the digest to the deployment", () => {
  const other = "0x00000000000000000000000000000000000000ff" as const;

  assert.notEqual(bidDigest(referenceBid, other), bidDigest(referenceBid, VERIFYING_CONTRACT));
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
  const account = privateKeyToAccount(REFERENCE_SIGNER_KEY);
  const signature = await account.signTypedData({
    domain: bidDomain(VERIFYING_CONTRACT),
    types: BID_TYPES,
    primaryType: "Bid",
    message: bidMessage(referenceBid),
  });

  assert.ok(
    await verifyTypedData({
      address: referenceBid.supplier,
      domain: bidDomain(VERIFYING_CONTRACT),
      types: BID_TYPES,
      primaryType: "Bid",
      message: bidMessage(referenceBid),
      signature,
    }),
  );
});

test("changes the commitment when the salt changes", () => {
  const hash = bidHash(referenceBid);
  const otherSalt = `0x${"ab".repeat(32)}` as const;

  assert.notEqual(bidCommitment(hash, otherSalt), bidCommitment(hash, REFERENCE_SALT));
});

test("roots the empty commitment set at bytes32(0)", () => {
  assert.equal(bidsRoot([]), ZERO);
});

/**
 * The two roots below are pinned in `onchain/test/SealedAuction.t.sol` against the same three
 * commitments. `abi.encodePacked` and `abi.encode` root the same array differently, and a suite
 * that pins neither agrees with whichever one it happens to use.
 */
test("roots commitments in arrival order, not sorted order", () => {
  const commitments = [
    keccak256(toHex("A")),
    keccak256(toHex("B")),
    keccak256(toHex("C")),
  ] as const;
  const [a, b, c] = commitments;

  assert.equal(
    bidsRoot(commitments),
    "0xffdbd9c1b65b61303d9298cfb6afcb3114a6ec8400b2280b102f32a581913b7f",
  );
  assert.equal(
    bidsRoot([c, a, b]),
    "0x4bab02b90a0348eb8ab4956b0e013ef1c3d7a4d77ad3c9253857dd8d0e561d1f",
  );
});

test("hashes a bid whose supplier address is not checksummed", () => {
  // A Circle wallet address arrives lowercased often enough that a throw here would look like a
  // signing bug rather than a formatting one.
  const lowercased = {
    ...referenceBid,
    supplier: referenceBid.supplier.toLowerCase() as `0x${string}`,
  };

  assert.equal(bidHash(lowercased), bidHash(referenceBid));
});

test("rejects a room count that does not fit the uint8 it is signed as", () => {
  // Unbounded, this throws inside viem instead, which drops the whole enclave run rather than one
  // bid.
  assert.equal(bidSchema.safeParse({ ...referenceBid, numberOfRooms: 300 }).success, false);
});
