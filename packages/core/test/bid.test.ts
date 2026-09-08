import { test } from "node:test";
import assert from "node:assert/strict";

import { assertBid } from "../src/bid.ts";
import { bid } from "./bid-fixture.ts";

// Every field is hashed as a fixed-width Solidity type. Truncating 4.5 stars to 4, or 2^32 metres
// to 0, would produce a bid that hashes one way here and another way in the Enclave, and the
// Enclave drops what it cannot match with only a count in the log.

test("accepts the fixture bid", () => {
  assert.doesNotThrow(() => assertBid(bid));
});

test("rejects a fractional star rating", () => {
  assert.throws(() => assertBid({ ...bid, stars: 4.5 }), /stars must be a whole number/);
});

test("rejects a star rating above uint8", () => {
  assert.throws(() => assertBid({ ...bid, stars: 256 }), /stars must be between 0 and 255/);
});

test("rejects a distance above uint32", () => {
  assert.throws(
    () => assertBid({ ...bid, distanceMeters: 4294967296 }),
    /distanceMeters must be between 0 and 4294967295/,
  );
});

test("rejects a fractional distance", () => {
  assert.throws(
    () => assertBid({ ...bid, distanceMeters: 1000.5 }),
    /distanceMeters must be a whole number/,
  );
});

test("rejects a room count above uint8", () => {
  assert.throws(
    () => assertBid({ ...bid, numberOfRooms: 300 }),
    /numberOfRooms must be between 0 and 255/,
  );
});

test("rejects a negative price", () => {
  assert.throws(() => assertBid({ ...bid, price: -1n }), /price must be between 0/);
});

test("rejects a price above uint256", () => {
  assert.throws(() => assertBid({ ...bid, price: 2n ** 256n }), /price must be between 0/);
});

test("rejects a price that is not USDC minor units as a bigint", () => {
  const fractional = { ...bid, price: 440.5 as unknown as bigint };

  assert.throws(() => assertBid(fractional), /price must be a bigint/);
});

test("rejects an auction id that is not 32 bytes", () => {
  assert.throws(() => assertBid({ ...bid, auctionId: "0x01" }), /auctionId must be 32 bytes/);
});

test("rejects a supplier that is not an address", () => {
  assert.throws(() => assertBid({ ...bid, supplier: "0xdead" }), /supplier must be a 20-byte/);
});
