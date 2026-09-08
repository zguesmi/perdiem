import type { Hex } from "viem";

/**
 * The Bid Commitment placed on chain with the Stake: `keccak256(abi.encode(bidHash, salt))`.
 *
 * The salt lives only here and inside the Sealed Bid. Without it the bid space is small enough that
 * keccak256 brute-forces the commitment in seconds.
 */
export function bidCommitment(_bidHash: Hex, _salt: Hex): Hex {
  throw new Error(
    "bidCommitment is not implemented yet. See docs/scratch/build/issues/03-eip712-bid-hashing-and-commitments.md",
  );
}
