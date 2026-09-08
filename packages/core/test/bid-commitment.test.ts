import { test } from "node:test";
import assert from "node:assert/strict";
import { concat, keccak256 } from "viem";

import { bidCommitment } from "../src/bid-commitment.ts";
import { bidHash } from "../src/bid-hash.ts";
import { bid, salt } from "./bid-fixture.ts";

// abi.encode of two bytes32 values is their concatenation, and stating it here is the point: the
// contract stores what this returns, so encodePacked and encode must not be swapped by accident.

test("is keccak256(abi.encode(bidHash, salt))", () => {
  const hash = bidHash(bid);

  assert.equal(bidCommitment(hash, salt), keccak256(concat([hash, salt])));
});

test("changes with the salt, while the struct hash does not", () => {
  const otherSalt = `0x${"ab".repeat(32)}` as const;
  const hash = bidHash(bid);

  assert.notEqual(bidCommitment(hash, salt), bidCommitment(hash, otherSalt));
});
