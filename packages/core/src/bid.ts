import { isAddress, isHex } from "viem";
import type { Address, Hex } from "viem";

/**
 * One supplier's priced offer, and the only thing it ever signs.
 *
 * `stars`, `distanceMeters`, `refundable` and `breakfastIncluded` are self-attested; the Stake is
 * the only thing that keeps them honest. See `docs/adr/0004-bid-attributes-are-self-attested.md`.
 *
 * The salt is deliberately not a field. It stays outside the struct hash, so a signature can be
 * checked without it and the Bid Commitment cannot be brute-forced with it.
 */
export type Bid = {
  /** bytes32, read from `AuctionCreated`. Never derived. */
  readonly auctionId: Hex;
  readonly supplier: Address;
  readonly hotelId: string;
  /** Signed, never scored. The page names the winner from it. */
  readonly hotelName: string;
  /** uint8 */
  readonly stars: number;
  /** uint32 */
  readonly distanceMeters: number;
  /** uint256, USDC minor units */
  readonly price: bigint;
  readonly refundable: boolean;
  readonly breakfastIncluded: boolean;
  readonly roomType: string;
  /** uint8 */
  readonly numberOfRooms: number;
};

const MAX_UINT8 = 255;
const MAX_UINT32 = 4294967295;
const MAX_UINT256 = 2n ** 256n - 1n;

/**
 * Throws unless `value` is 32 bytes of hex.
 *
 * Nothing is padded here. A left-padded salt or hash produces a different commitment, and the
 * Enclave drops what it cannot match.
 */
export function assertBytes32(label: string, value: Hex): void {
  if (!isHex(value) || value.length !== 66) {
    throw new TypeError(`${label} must be 32 bytes of hex, got ${String(value)}`);
  }
}

function assertUnsignedInteger(label: string, value: number, max: number): void {
  if (!Number.isInteger(value)) {
    throw new RangeError(`${label} must be a whole number, got ${String(value)}`);
  }
  if (value < 0 || value > max) {
    throw new RangeError(`${label} must be between 0 and ${max}, got ${String(value)}`);
  }
}

/**
 * Throws unless every field fits the Solidity type it is hashed as.
 *
 * Rejecting is the point. A fractional or oversized field that is truncated somewhere downstream
 * hashes one way here and another way in the Enclave, which drops the bid with only a count in the
 * log. The bid is the supplier's single shot, so it fails here instead, where the message is read.
 */
export function assertBid(bid: Bid): void {
  assertBytes32("auctionId", bid.auctionId);
  if (!isAddress(bid.supplier, { strict: false })) {
    throw new TypeError(`supplier must be a 20-byte address, got ${String(bid.supplier)}`);
  }
  assertUnsignedInteger("stars", bid.stars, MAX_UINT8);
  assertUnsignedInteger("distanceMeters", bid.distanceMeters, MAX_UINT32);
  assertUnsignedInteger("numberOfRooms", bid.numberOfRooms, MAX_UINT8);
  if (typeof bid.price !== "bigint") {
    throw new TypeError(`price must be a bigint of USDC minor units, got ${typeof bid.price}`);
  }
  if (bid.price < 0n || bid.price > MAX_UINT256) {
    throw new RangeError(`price must be between 0 and 2^256 - 1, got ${String(bid.price)}`);
  }
}
