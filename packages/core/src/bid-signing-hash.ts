import { hashTypedData } from "viem";
import type { Address, Hex, TypedDataDomain } from "viem";

import { assertBid } from "./bid.ts";
import type { Bid } from "./bid.ts";
import { bidTypes } from "./bid-hash.ts";
import { ARC_TESTNET_CHAIN_ID } from "./chain.ts";

/**
 * The EIP-712 domain, fixed per deployment, so a signature for auction 1 on one deployment cannot
 * be replayed against auction 1 on another.
 */
export function bidDomain(verifyingContract: Address): TypedDataDomain {
  return {
    name: "Perdiem",
    version: "1",
    chainId: ARC_TESTNET_CHAIN_ID,
    verifyingContract,
  };
}

/**
 * What a supplier actually signs: `keccak256(0x1901 ‖ domainSeparator ‖ bidHash)`.
 *
 * @param verifyingContract The `SealedAuction` address this bid is for.
 */
export function bidSigningHash(bid: Bid, verifyingContract: Address): Hex {
  assertBid(bid);

  return hashTypedData({
    domain: bidDomain(verifyingContract),
    types: bidTypes,
    primaryType: "Bid",
    message: bid,
  });
}
