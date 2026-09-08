import { readFileSync } from "node:fs";
import type { Address, Hex } from "viem";

import type { Bid } from "../src/bid.ts";

type BidHashFixture = {
  readonly eip712Type: string;
  readonly domain: { readonly chainId: number; readonly verifyingContract: Address };
  readonly bid: Omit<Bid, "price"> & { readonly price: string };
  readonly salt: Hex;
  readonly expected: {
    readonly bidHash: Hex;
    readonly signingHash: Hex;
    readonly commitment: Hex;
  };
};

// Read from disk, not imported, because the Solidity test in onchain/ reads the same file the same
// way. One input, two languages, no second expectation to drift.
const fixture = JSON.parse(
  readFileSync(new URL("../fixtures/bid-hash.json", import.meta.url), "utf8"),
) as BidHashFixture;

export const eip712Type = fixture.eip712Type;
export const salt = fixture.salt;
export const expected = fixture.expected;
export const verifyingContract = fixture.domain.verifyingContract;
export const chainId = fixture.domain.chainId;

export const bid: Bid = {
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
};
