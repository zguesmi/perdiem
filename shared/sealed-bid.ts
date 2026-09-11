import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { hexToBytes, stringToBytes } from "viem";
import { z } from "zod";

import { bidSchema, bytes32Schema } from "./bid.ts";

/**
 * The sealed bid envelope. The relay never holds a readable bid, because a readable bid leaks the
 * salt and the bid space is small enough to brute-force the commitment in seconds without it.
 *
 * ```
 * envelope = ephemeralPublicKey(32) || nonce(24) || ciphertext
 * key      = HKDF-SHA256(
 *              X25519(ephemeralSecretKey, enclavePublicKey),
 *              ephemeralPublicKey || enclavePublicKey,
 *              "perdiem/sealed-bid/v1" || auctionId,
 *              32
 *            )
 * ```
 *
 * Opening needs no randomness, which is what lets it run in the enclave: CRE runtime has no
 * `crypto.getRandomValues`.
 */

const EPHEMERAL_KEY_BYTE_LENGTH = 32;
const NONCE_BYTE_LENGTH = 24;
/** Bytes, not a string: `TextEncoder` is not in the inventory the enclave runtime was probed for. */
const INFO_PREFIX = stringToBytes("perdiem/sealed-bid/v1");

export const sealedBidPayloadSchema = z
  .object({
    bid: bidSchema,
    salt: bytes32Schema,
    signature: z.custom<`0x${string}`>(
      (value) => typeof value === "string" && /^0x[0-9a-fA-F]+$/.test(value),
      "expected a hex-encoded signature",
    ),
  })
  .strict();

export type SealedBidPayload = z.infer<typeof sealedBidPayloadSchema>;

function envelopeKey(
  sharedSecret: Uint8Array,
  ephemeralPublicKey: Uint8Array,
  enclavePublicKey: Uint8Array,
  auctionId: `0x${string}`,
): Uint8Array {
  const salt = new Uint8Array(ephemeralPublicKey.length + enclavePublicKey.length);
  salt.set(ephemeralPublicKey);
  salt.set(enclavePublicKey, ephemeralPublicKey.length);

  const auction = hexToBytes(auctionId);
  const info = new Uint8Array(INFO_PREFIX.length + auction.length);
  info.set(INFO_PREFIX);
  info.set(auction, INFO_PREFIX.length);

  return hkdf(sha256, sharedSecret, salt, info, 32);
}

/** Called by the supplier agent, on Node. One ephemeral keypair per bid, thrown away after use. */
export function sealBid(
  payload: SealedBidPayload,
  enclavePublicKey: Uint8Array,
  auctionId: `0x${string}`,
): Uint8Array {
  const ephemeralSecretKey = x25519.utils.randomSecretKey();
  const ephemeralPublicKey = x25519.getPublicKey(ephemeralSecretKey);
  const key = envelopeKey(
    x25519.getSharedSecret(ephemeralSecretKey, enclavePublicKey),
    ephemeralPublicKey,
    enclavePublicKey,
    auctionId,
  );

  // Parsed here so a bid the enclave would drop fails on the supplier's own machine instead. The
  // enclave logs a count and no reason.
  sealedBidPayloadSchema.parse(payload);

  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTE_LENGTH));
  const ciphertext = xchacha20poly1305(key, nonce).encrypt(
    new TextEncoder().encode(JSON.stringify(payload)),
  );

  const envelope = new Uint8Array(
    EPHEMERAL_KEY_BYTE_LENGTH + NONCE_BYTE_LENGTH + ciphertext.length,
  );
  envelope.set(ephemeralPublicKey);
  envelope.set(nonce, EPHEMERAL_KEY_BYTE_LENGTH);
  envelope.set(ciphertext, EPHEMERAL_KEY_BYTE_LENGTH + NONCE_BYTE_LENGTH);

  return envelope;
}

/**
 * Called inside the enclave. Throws on a wrong key, a flipped byte, another auction's envelope, a
 * bid that names another auction, or a payload that is not a bid. Every one of those is one dropped bid and a count in the log,
 * never the reason.
 */
export function openSealedBid(
  envelope: Uint8Array,
  enclavePrivateKey: Uint8Array,
  auctionId: `0x${string}`,
): SealedBidPayload {
  if (envelope.length <= EPHEMERAL_KEY_BYTE_LENGTH + NONCE_BYTE_LENGTH) {
    throw new Error("sealed bid is too short to hold an ephemeral key, a nonce and a ciphertext");
  }

  const ephemeralPublicKey = envelope.subarray(0, EPHEMERAL_KEY_BYTE_LENGTH);
  const nonce = envelope.subarray(
    EPHEMERAL_KEY_BYTE_LENGTH,
    EPHEMERAL_KEY_BYTE_LENGTH + NONCE_BYTE_LENGTH,
  );
  const ciphertext = envelope.subarray(EPHEMERAL_KEY_BYTE_LENGTH + NONCE_BYTE_LENGTH);

  const key = envelopeKey(
    x25519.getSharedSecret(enclavePrivateKey, ephemeralPublicKey),
    ephemeralPublicKey,
    x25519.getPublicKey(enclavePrivateKey),
    auctionId,
  );

  const plaintext = xchacha20poly1305(key, nonce).decrypt(ciphertext);

  // `Buffer` rather than `TextDecoder`: the enclave runtime is Javy, where `Buffer` is confirmed
  // present and `TextDecoder` was never probed.
  const payload = sealedBidPayloadSchema.parse(JSON.parse(Buffer.from(plaintext).toString("utf8")));

  // The HKDF binds the envelope to the auction, not the bid inside it. Without this, a supplier
  // could re-seal a bid signed for one auction under another, and both the signature and the
  // commitment would still check out.
  if (payload.bid.auctionId !== auctionId) {
    throw new Error("sealed bid names a different auction than the one it was sealed for");
  }

  return payload;
}
