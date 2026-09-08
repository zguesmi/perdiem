import { test } from "node:test";
import assert from "node:assert/strict";
import { concat, keccak256, pad, toBytes, toHex } from "viem";

import { bidHash, bidTypes } from "../src/bid-hash.ts";
import { bid, eip712Type } from "./bid-fixture.ts";

// EIP-712 encodeData is rebuilt here from keccak256 and padding rather than from viem's typed-data
// helpers. An implementation asserted against itself proves nothing, and this is the hash the
// Enclave checks every signature against.

test("hashes the type string docs/spec.md writes out", () => {
  const encodeType = `Bid(${bidTypes.Bid.map((member) => `${member.type} ${member.name}`).join(",")})`;

  assert.equal(encodeType, eip712Type);
});

test("names no salt: the salt is not a member of the struct", () => {
  assert.equal(eip712Type.includes("salt"), false);
});

test("is keccak256 of the EIP-712 encodeData", () => {
  const encodeData = concat([
    keccak256(toBytes(eip712Type)),
    bid.auctionId,
    pad(bid.supplier),
    keccak256(toBytes(bid.hotelId)),
    keccak256(toBytes(bid.hotelName)),
    pad(toHex(bid.stars)),
    pad(toHex(bid.distanceMeters)),
    pad(toHex(bid.price)),
    pad(toHex(bid.refundable)),
    pad(toHex(bid.breakfastIncluded)),
    keccak256(toBytes(bid.roomType)),
    pad(toHex(bid.numberOfRooms)),
  ]);

  assert.equal(bidHash(bid), keccak256(encodeData));
});

test("changes when a single field changes", () => {
  assert.notEqual(bidHash(bid), bidHash({ ...bid, price: bid.price + 1n }));
});
