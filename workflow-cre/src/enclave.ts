import { secp256k1 } from "@noble/curves/secp256k1.js";
import { hexToBytes, keccak256 } from "viem";

import { bidCommitment, bidDigest, bidHash, bidsRoot } from "../../shared/bid.ts";
import type { Settlement } from "../../shared/report.ts";
import { openSealedBid, type SealedBidPayload } from "../../shared/sealed-bid.ts";
import { openSealedPolicy } from "../../shared/sealed-policy.ts";
import { settle } from "./scoring.ts";

/**
 * Everything the enclave does between the two chain writes, with the chain and the relay already
 * read. It is a plain function of its inputs so that the whole pipeline is exercised without a CRE
 * runtime; `workflow.ts` supplies the capabilities and nothing else.
 *
 * Nothing here may be logged. The policy, the decrypted bids and the booking credentials all live
 * in this file's locals, and only the settlement leaves it.
 */

export interface EnclaveInputs {
  auctionId: `0x${string}`;
  /** Read from the chain. The sealed policy is rejected unless it hashes to this. */
  policyHash: `0x${string}`;
  /** The escrow, which is also the EIP-712 verifying contract every bid is signed against. */
  sealedAuction: `0x${string}`;
  /** Every commitment the chain holds for the auction, in arrival order. */
  commitments: readonly `0x${string}`[];
  /** The address that placed each of those commitments, in the same order. */
  committers: readonly `0x${string}`[];
  sealedPolicy: Uint8Array;
  /** The ciphertexts the relay holds. A supplier that committed may have posted none. */
  sealedBids: readonly Uint8Array[];
  enclavePrivateKey: Uint8Array;
  /** ERC-1271 `isValidSignature` against the supplier's own account, for a contract account. */
  isValidSignature: (
    supplier: `0x${string}`,
    digest: `0x${string}`,
    signature: `0x${string}`,
  ) => boolean;
  /** Books the winner against its own API and returns the booking reference, or "" on a failure. */
  book: (payload: SealedBidPayload) => string;
}

export interface EnclaveResult {
  settlement: Settlement;
  /** Sealed bids that decrypted, verified and reached scoring. */
  scored: number;
  /** Sealed bids dropped, for any reason. A reason would name a bid, so none is reported. */
  dropped: number;
}

export function runEnclave(inputs: EnclaveInputs): EnclaveResult {
  const policy = openSealedPolicy(inputs.sealedPolicy, inputs.enclavePrivateKey, inputs.policyHash);

  const committed = new Map(
    inputs.committers.map((committer, index) => [
      committer.toLowerCase(),
      inputs.commitments[index],
    ]),
  );

  const opened = inputs.sealedBids.flatMap((envelope) => {
    const payload = verified(envelope, committed, inputs);

    return payload === null ? [] : [payload];
  });

  const { winner, payout } = settle(
    policy,
    opened.map((payload) => payload.bid),
  );
  const won = opened.find((payload) => payload.bid.supplier === winner);

  // No booking, no payout. The enclave does not fall through to the second best bid: the cap and
  // every stake go back instead.
  const bookingId = won === undefined ? "" : inputs.book(won);
  const paid = bookingId !== "";

  return {
    settlement: {
      auctionId: inputs.auctionId,
      winner: paid ? winner : null,
      payout: paid ? payout : 0,
      policyHash: inputs.policyHash,
      // Over the chain's array, not over the bids that scored. A committer whose ciphertext never
      // reached the relay is still in the root the contract recomputes.
      bidsRoot: bidsRoot(inputs.commitments),
      bookingId,
    },
    scored: opened.length,
    dropped: inputs.sealedBids.length - opened.length,
  };
}

/**
 * One sealed bid, decrypted and checked against what its supplier put on chain. `null` for any
 * failure: a wrong key, a flipped byte, another auction's envelope, a signature that is not the
 * supplier's, or a commitment that is not the one the stake was placed behind.
 */
function verified(
  envelope: Uint8Array,
  committed: ReadonlyMap<string, `0x${string}` | undefined>,
  inputs: EnclaveInputs,
): SealedBidPayload | null {
  try {
    const payload = openSealedBid(envelope, inputs.enclavePrivateKey, inputs.auctionId);
    const { bid, salt, signature } = payload;
    const digest = bidDigest(bid, inputs.sealedAuction);

    const signed =
      recoverSigner(digest, signature) === bid.supplier.toLowerCase() ||
      inputs.isValidSignature(bid.supplier, digest, signature);

    return signed && bidCommitment(bidHash(bid), salt) === committed.get(bid.supplier.toLowerCase())
      ? payload
      : null;
  } catch {
    return null;
  }
}

/**
 * `ecrecover`, in the lower case an address compares in. It is tried before the ERC-1271 call
 * because an externally owned account answers nothing at all to one.
 *
 * Written against `@noble/curves` rather than viem's recovery, which is asynchronous: the enclave
 * runs one synchronous pass and has no event loop to await on.
 */
function recoverSigner(digest: `0x${string}`, signature: `0x${string}`): string | null {
  const bytes = hexToBytes(signature);
  const flag = bytes[64];

  if (bytes.length !== 65 || flag === undefined) {
    return null;
  }

  // Both spellings of the recovery byte are in the wild: 27 and 28 from Ethereum tooling, 0 and 1
  // from a raw library.
  const recovery = flag >= 27 ? flag - 27 : flag;

  if (recovery > 1) {
    return null;
  }

  try {
    const publicKey = secp256k1.Signature.fromBytes(bytes.subarray(0, 64), "compact")
      .addRecoveryBit(recovery)
      .recoverPublicKey(hexToBytes(digest))
      .toBytes(false);

    // The address is the last twenty bytes of the hash of the uncompressed key, minus its prefix.
    return `0x${keccak256(publicKey.subarray(1)).slice(-40)}`;
  } catch {
    return null;
  }
}
