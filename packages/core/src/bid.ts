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
