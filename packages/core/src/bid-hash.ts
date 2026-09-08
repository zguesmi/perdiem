import { hashStruct } from "viem";
import type { Hex } from "viem";
import { assertBid } from "./bid.ts";
import type { Bid } from "./bid.ts";

/**
 * The EIP-712 member list of a Bid, in the order `docs/spec.md` writes the type out. Reordering it
 * changes every bidHash, so an honest bid would fail the Enclave's signature check.
 *
 * Exported so that a supplier agent signs with viem's `signTypedData` and never restates the type.
 */
export const bidTypes = {
  Bid: [
    { name: "auctionId", type: "bytes32" },
    { name: "supplier", type: "address" },
    { name: "hotelId", type: "string" },
    { name: "hotelName", type: "string" },
    { name: "stars", type: "uint8" },
    { name: "distanceMeters", type: "uint32" },
    { name: "price", type: "uint256" },
    { name: "refundable", type: "bool" },
    { name: "breakfastIncluded", type: "bool" },
    { name: "roomType", type: "string" },
    { name: "numberOfRooms", type: "uint8" },
  ],
} as const;

/**
 * The EIP-712 `hashStruct` of a Bid: no salt, no domain.
 *
 * This is the first of the three hashes `docs/spec.md` keeps apart. It is not what is signed, and
 * it is not the Bid Commitment.
 */
export function bidHash(bid: Bid): Hex {
  assertBid(bid);

  return hashStruct({ data: bid, primaryType: "Bid", types: bidTypes });
}
