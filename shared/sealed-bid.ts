import { isHex } from "viem";
import { z } from "zod";

import { bidSchema, bytes32Schema } from "./bid.ts";
import { envelopeInfo, open, seal } from "./envelope.ts";

/**
 * The sealed bid envelope. The relay never holds a readable bid, because a readable bid leaks the
 * salt and the bid space is small enough to brute-force the commitment in seconds without it.
 *
 * The scheme is `shared/envelope.ts`. This module is its bid domain: the envelope is bound to the
 * auction it was sealed for.
 */

const DOMAIN = "perdiem/sealed-bid/v1";

export const sealedBidPayloadSchema = z
  .object({
    bid: bidSchema,
    salt: bytes32Schema,
    signature: z.custom<`0x${string}`>(
      (value) => isHex(value) && value.length > 2,
      "expected a hex-encoded signature",
    ),
    // Beside the bid for the reason the salt is: a member the type does not have cannot reach
    // `hashStruct`. Only the enclave reads them, and nothing logs them.
    bookingUrl: z.url(),
    bookingApiKey: z.string().min(1),
  })
  .strict();

export type SealedBidPayload = z.infer<typeof sealedBidPayloadSchema>;

/** Called by the supplier agent, on Node. */
export function sealBid(
  payload: SealedBidPayload,
  enclavePublicKey: Uint8Array,
  auctionId: `0x${string}`,
): Uint8Array {
  // Parsed here so a bid the enclave would drop fails on the supplier's own machine instead. The
  // enclave logs a count and no reason.
  sealedBidPayloadSchema.parse(payload);

  return seal(JSON.stringify(payload), enclavePublicKey, envelopeInfo(DOMAIN, auctionId));
}

/**
 * Called inside the enclave. Throws on a wrong key, a flipped byte, another auction's envelope, a
 * bid that names another auction, or a payload that is not a bid. Every one of those is one
 * dropped bid and a count in the log, never the reason.
 */
export function openSealedBid(
  envelope: Uint8Array,
  enclavePrivateKey: Uint8Array,
  auctionId: `0x${string}`,
): SealedBidPayload {
  const plaintext = open(envelope, enclavePrivateKey, envelopeInfo(DOMAIN, auctionId));
  const payload = sealedBidPayloadSchema.parse(JSON.parse(plaintext));

  // The envelope is bound to the auction, not to the bid inside it. Without this, a supplier could
  // re-seal a bid signed for one auction under another, and both the signature and the commitment
  // would still check out.
  if (payload.bid.auctionId !== auctionId) {
    throw new Error("sealed bid names a different auction than the one it was sealed for");
  }

  return payload;
}
