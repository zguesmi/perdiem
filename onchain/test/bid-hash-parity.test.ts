import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { network } from "hardhat";
import { keccak256, toBytes } from "viem";

// The parity test. packages/core computes these two hashes in TypeScript and asserts them against
// the same file; the supplier agents sign what it produces and the contract stores what it
// commits. A byte of disagreement between the two languages is a bid the Enclave drops, with only
// a count in the log to say so.
//
// The fixture is read from disk rather than imported: onchain does not depend on @perdiem/core,
// and the Solidity side must not be able to borrow the TypeScript answer.

type Fixture = {
  eip712Type: string;
  bid: {
    auctionId: `0x${string}`;
    supplier: `0x${string}`;
    hotelId: string;
    hotelName: string;
    stars: number;
    distanceMeters: number;
    price: string;
    refundable: boolean;
    breakfastIncluded: boolean;
    roomType: string;
    numberOfRooms: number;
  };
  salt: `0x${string}`;
  expected: { bidHash: `0x${string}`; commitment: `0x${string}` };
};

const fixture = JSON.parse(
  readFileSync(new URL("../../packages/core/fixtures/bid-hash.json", import.meta.url), "utf8"),
) as Fixture;

// Written out field by field, in the order of the EIP-712 type. A struct argument is positional
// once it reaches the ABI encoder, so a reordered literal here would hash to something else.
const bid = {
  auctionId: fixture.bid.auctionId,
  supplier: fixture.bid.supplier,
  hotelId: fixture.bid.hotelId,
  hotelName: fixture.bid.hotelName,
  stars: fixture.bid.stars,
  distanceMeters: fixture.bid.distanceMeters,
  price: BigInt(fixture.bid.price),
  refundable: fixture.bid.refundable,
  breakfastIncluded: fixture.bid.breakfastIncluded,
  roomType: fixture.bid.roomType,
  numberOfRooms: fixture.bid.numberOfRooms,
} as const;

describe("BidHash", async () => {
  const { viem } = await network.create();

  it("hashes the type string docs/spec.md writes out", async () => {
    const bidHash = await viem.deployContract("BidHash");

    assert.equal(await bidHash.read.BID_TYPE_HASH(), keccak256(toBytes(fixture.eip712Type)));
  });

  it("hashes a bid to the bytes TypeScript hashes it to", async () => {
    const bidHash = await viem.deployContract("BidHash");

    assert.equal(await bidHash.read.hashBid([bid]), fixture.expected.bidHash);
  });

  it("commits a bid to the bytes TypeScript commits it to", async () => {
    const bidHash = await viem.deployContract("BidHash");

    assert.equal(
      await bidHash.read.commitmentOf([fixture.expected.bidHash, fixture.salt]),
      fixture.expected.commitment,
    );
  });
});
