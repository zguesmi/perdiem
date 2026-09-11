import {
  concatHex,
  encodeAbiParameters,
  hashStruct,
  hashTypedData,
  isAddress,
  isHex,
  keccak256,
  zeroHash,
} from "viem";
import { z } from "zod";

import { ARC_CHAIN_ID } from "./chain.ts";

/**
 * The bid a supplier signs. Three hashes come off it, and swapping two of them drops honest bids:
 *
 * - `bidHash` is the EIP-712 struct hash. No salt, no domain.
 * - the signature is over `keccak256(0x1901 || domainSeparator || bidHash)`, which is `bidDigest`.
 * - the Bid Commitment is `keccak256(abi.encode(bidHash, salt))`.
 *
 * The salt is not a member of the struct, so a signature is checkable without it and the salt
 * cannot be used to brute-force the commitment. It travels sealed, alongside the bid.
 *
 * Every number is an integer, for the reason `docs/adr/0003-canonical-encoding.md` gives.
 */

/** The length is explicit because `isHex` does not check the width. */
export const bytes32Schema = z.custom<`0x${string}`>(
  (value) => isHex(value) && value.length === 66,
  "expected 32 hex-encoded bytes",
);

export const addressSchema = z.custom<`0x${string}`>(
  (value) => typeof value === "string" && isAddress(value),
  "expected an address",
);

export const bidSchema = z
  .object({
    auctionId: bytes32Schema,
    supplier: addressSchema,
    hotelId: z.string().min(1),
    hotelName: z.string().min(1),
    stars: z.int().min(1).max(5),
    distanceMeters: z.int().min(0).max(4_294_967_295),
    price: z.int().min(1),
    refundable: z.boolean(),
    breakfastIncluded: z.boolean(),
    roomType: z.string().min(1),
    numberOfRooms: z.int().min(1).max(255),
  })
  .strict();

export type Bid = z.infer<typeof bidSchema>;

/** The EIP-712 type, in the order the type string declares. */
export const BID_TYPES = {
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
 * Fixed per deployment, so a signature for one auction cannot be replayed against the same auction
 * on another deployment.
 */
export function bidDomain(verifyingContract: `0x${string}`) {
  return { name: "Perdiem", version: "1", chainId: ARC_CHAIN_ID, verifyingContract } as const;
}

/**
 * The bid as viem's typed-data helpers want it. `price` is a safe integer everywhere else, because
 * a Bid is JSON before it is anything else and `JSON.stringify` cannot encode a bigint. The
 * widening happens here and nowhere else, so a supplier signing with `signTypedData` passes this.
 */
export function bidMessage(bid: Bid) {
  // The supplier address is lowercased because viem rejects a mixed-case address whose checksum
  // does not match. An address encodes to twenty bytes either way, so no hash moves.
  return {
    ...bid,
    supplier: bid.supplier.toLowerCase() as `0x${string}`,
    price: BigInt(bid.price),
  };
}

/** The EIP-712 struct hash. Extra members on the argument are ignored, the salt included. */
export function bidHash(bid: Bid): `0x${string}` {
  return hashStruct({ data: bidMessage(bid), primaryType: "Bid", types: BID_TYPES });
}

/** What the supplier actually signs, and what the ERC-1271 check passes to the wallet. */
export function bidDigest(bid: Bid, verifyingContract: `0x${string}`): `0x${string}` {
  return hashTypedData({
    domain: bidDomain(verifyingContract),
    types: BID_TYPES,
    primaryType: "Bid",
    message: bidMessage(bid),
  });
}

/** What goes on chain during `commit`, before any bid is readable. */
export function bidCommitment(hash: `0x${string}`, salt: `0x${string}`): `0x${string}` {
  return keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "bytes32" }], [hash, salt]));
}

/**
 * The root that binds a settlement to the exact set of on-chain commitments. Every commitment for
 * the auction, in the order it arrived, and `bytes32(0)` for none at all. `SealedAuction.bidsRoot`
 * recomputes it, and `abi.encodePacked` over a `bytes32[]` is a plain concatenation.
 */
export function bidsRoot(commitments: readonly `0x${string}`[]): `0x${string}` {
  if (commitments.length === 0) {
    return zeroHash;
  }
  return keccak256(concatHex(commitments));
}
