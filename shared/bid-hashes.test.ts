import { test } from "node:test";
import assert from "node:assert/strict";

import { bidCommitment, bidHash, bidsRoot } from "./bid.ts";
import { bidFixture } from "./bid-fixture.ts";
import { GOLDEN_COMMITMENTS, GOLDEN_SALT, goldenBid } from "./golden-bid.ts";

// Three hashes cross a language boundary, and each one drops honest bids when the two sides
// disagree. Every side asserts against `fixtures/bid-hashes.json` and no side computes its own
// expected value. Regenerate the file with `pnpm fixtures`.

test("holds the inputs it was generated from", () => {
  // Without this, editing `golden-bid.ts` and forgetting `pnpm fixtures` leaves a stale fixture
  // that every other assertion below still agrees with.
  assert.deepEqual(bidFixture.bid, goldenBid);
  assert.equal(bidFixture.salt, GOLDEN_SALT);
  assert.deepEqual(bidFixture.commitments, [...GOLDEN_COMMITMENTS]);
});

test("hashes the fixture bid to the committed struct hash", () => {
  assert.equal(bidHash(bidFixture.bid), bidFixture.bidHash);
});

test("commits the fixture bid and salt to the committed commitment", () => {
  assert.equal(bidCommitment(bidFixture.bidHash, bidFixture.salt), bidFixture.commitment);
});

test("roots the fixture commitments in their arrival order", () => {
  assert.equal(bidsRoot(bidFixture.commitments), bidFixture.bidsRoot);
});

test("roots an empty commitment set to bytes32(0)", () => {
  assert.equal(bidsRoot([]), bidFixture.emptyBidsRoot);
});

test("roots a sorted order to something else", () => {
  // The fixture's arrival order is deliberately not ascending. A root that survives sorting would
  // mean the contract and the enclave could disagree about which set they hashed.
  const sorted = [...bidFixture.commitments].sort();

  assert.notDeepEqual(sorted, bidFixture.commitments);
  assert.notEqual(bidsRoot(sorted), bidFixture.bidsRoot);
});
