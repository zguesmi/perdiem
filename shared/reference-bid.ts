import type { Bid } from "./bid.ts";

/**
 * The winning bid of the reference auction, and the inputs the bid hashing tests are written
 * against. These values are arbitrary but fixed: changing one changes every hash asserted below.
 */
export const REFERENCE_AUCTION_ID = `0x${"a1".repeat(32)}` as const;

export const REFERENCE_SALT = `0x${"5a".repeat(32)}` as const;

/** The address the EIP-712 domain is pinned to. A deployment supplies its own. */
export const VERIFYING_CONTRACT = "0x000000000000000000000000000000000000dEaD" as const;

/**
 * The key the fixture's bid is signed with, and the supplier address it names. A fixed key keeps
 * the signature checks in the tests honest: the address in the bid is the address that signed it.
 * Test scaffolding, and it holds nothing on any chain.
 */
export const REFERENCE_SIGNER_KEY = `0x${"11".repeat(32)}` as const;

export const referenceBid: Bid = {
  auctionId: REFERENCE_AUCTION_ID,
  supplier: "0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A",
  hotelId: "lp1a2b3",
  hotelName: "Awesome Hotel",
  stars: 4,
  distanceMeters: 1000,
  price: 440_000_000,
  refundable: true,
  breakfastIncluded: true,
  roomType: "double",
  numberOfRooms: 1,
};
