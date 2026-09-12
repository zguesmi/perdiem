import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { hexToBytes, stringToBytes } from "viem";

/**
 * One envelope scheme, sealed to the enclave's X25519 public key. Everything the enclave alone may
 * read travels in one of these: a sealed bid, and the policy itself.
 *
 * ```
 * envelope = ephemeralPublicKey(32) || nonce(24) || ciphertext
 * key      = HKDF-SHA256(
 *              X25519(ephemeralSecretKey, enclavePublicKey),
 *              ephemeralPublicKey || enclavePublicKey,
 *              domain || binding,
 *              32
 *            )
 * ```
 *
 * The `info` binds each envelope to its own domain and to the one identifier it belongs to, so a
 * ciphertext sealed for one purpose cannot be opened as another.
 *
 * Opening needs no randomness, which is what lets it run in the enclave: the CRE runtime has no
 * `crypto.getRandomValues`.
 */

const EPHEMERAL_KEY_LENGTH = 32;
const NONCE_LENGTH = 24;

function concat(...parts: Uint8Array[]): Uint8Array {
  const joined = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  return joined;
}

/**
 * The HKDF `info` for one domain and one identifier.
 *
 * Bytes, not a string: `TextEncoder` is not in the inventory the enclave runtime was probed for.
 */
export function envelopeInfo(domain: string, binding: `0x${string}`): Uint8Array {
  return concat(stringToBytes(domain), hexToBytes(binding));
}

function envelopeKey(
  sharedSecret: Uint8Array,
  ephemeralPublicKey: Uint8Array,
  enclavePublicKey: Uint8Array,
  info: Uint8Array,
): Uint8Array {
  return hkdf(sha256, sharedSecret, concat(ephemeralPublicKey, enclavePublicKey), info, 32);
}

/** Called outside the enclave, on Node. One ephemeral keypair per envelope, thrown away after use. */
export function seal(
  plaintext: string,
  enclavePublicKey: Uint8Array,
  info: Uint8Array,
): Uint8Array {
  const ephemeralSecretKey = x25519.utils.randomSecretKey();
  const ephemeralPublicKey = x25519.getPublicKey(ephemeralSecretKey);
  const key = envelopeKey(
    x25519.getSharedSecret(ephemeralSecretKey, enclavePublicKey),
    ephemeralPublicKey,
    enclavePublicKey,
    info,
  );

  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH));
  const ciphertext = xchacha20poly1305(key, nonce).encrypt(Buffer.from(plaintext, "utf8"));

  return concat(ephemeralPublicKey, nonce, ciphertext);
}

/** Called inside the enclave. Throws on a wrong key, a flipped byte, or another domain's envelope. */
export function open(
  envelope: Uint8Array,
  enclavePrivateKey: Uint8Array,
  info: Uint8Array,
): string {
  if (envelope.length <= EPHEMERAL_KEY_LENGTH + NONCE_LENGTH) {
    throw new Error("envelope is too short to hold an ephemeral key, a nonce and a ciphertext");
  }

  const ephemeralPublicKey = envelope.subarray(0, EPHEMERAL_KEY_LENGTH);
  const nonce = envelope.subarray(EPHEMERAL_KEY_LENGTH, EPHEMERAL_KEY_LENGTH + NONCE_LENGTH);
  const ciphertext = envelope.subarray(EPHEMERAL_KEY_LENGTH + NONCE_LENGTH);

  const key = envelopeKey(
    x25519.getSharedSecret(enclavePrivateKey, ephemeralPublicKey),
    ephemeralPublicKey,
    x25519.getPublicKey(enclavePrivateKey),
    info,
  );

  // `Buffer` rather than `TextDecoder`: the enclave runtime is Javy, where `Buffer` is confirmed
  // present and `TextDecoder` was never probed.
  return Buffer.from(xchacha20poly1305(key, nonce).decrypt(ciphertext)).toString("utf8");
}
