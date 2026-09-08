import type { Address, Hex, TypedDataDomain } from "viem";
import type { Bid } from "./bid.ts";

/**
 * The EIP-712 domain, fixed per deployment, so a signature for auction 1 on one deployment cannot
 * be replayed against auction 1 on another.
 */
export function bidDomain(_verifyingContract: Address): TypedDataDomain {
  throw new Error(
    "bidDomain is not implemented yet. See docs/scratch/build/issues/03-eip712-bid-hashing-and-commitments.md",
  );
}

/**
 * What a supplier actually signs: `keccak256(0x1901 ‖ domainSeparator ‖ bidHash)`.
 *
 * @param verifyingContract The `SealedAuction` address this bid is for.
 */
export function bidSigningHash(_bid: Bid, _verifyingContract: Address): Hex {
  throw new Error(
    "bidSigningHash is not implemented yet. See docs/scratch/build/issues/03-eip712-bid-hashing-and-commitments.md",
  );
}
