import { envelopeInfo, open, seal } from "./envelope.ts";
import { canonicalJson } from "./canonical-json.ts";
import { hashPolicy } from "./policy-hash.ts";
import { policySchema, type Policy } from "./policy.ts";

/**
 * The sealed policy envelope. The policy is private, so it reaches the enclave as ciphertext the
 * enclave alone can open, keyed at the relay by the hash that is already on chain.
 *
 * Keyed by the policy hash and not the auction identifier: the identifier commits to deadlines the
 * contract derives from `block.timestamp`, so the buyer cannot compute it before `createAuction`
 * mines, while the hash is known before it. See `docs/adr/0008-the-policy-travels-through-the-relay.md`.
 *
 * The scheme is `shared/envelope.ts`. This module is its policy domain.
 */

const DOMAIN = "perdiem/sealed-policy/v1";

/** Called by the purchaser service, before it opens the auction that commits to this hash. */
export function sealPolicy(
  policy: Policy,
  enclavePublicKey: Uint8Array,
  policyHash: `0x${string}`,
): Uint8Array {
  // The canonical bytes, so what the enclave hashes is what the buyer hashed.
  return seal(canonicalJson(policy), enclavePublicKey, envelopeInfo(DOMAIN, policyHash));
}

/**
 * Called inside the enclave, with the policy hash read from the chain. Throws on a wrong key, a
 * flipped byte, another domain's envelope, a payload that is not a policy, or a policy that is not
 * the committed one. Every one of those means no settlement, and the auction refunds on timeout.
 */
export function openSealedPolicy(
  envelope: Uint8Array,
  enclavePrivateKey: Uint8Array,
  policyHash: `0x${string}`,
): Policy {
  const plaintext = open(envelope, enclavePrivateKey, envelopeInfo(DOMAIN, policyHash));
  const policy = policySchema.parse(JSON.parse(plaintext));

  // The envelope binds the ciphertext to the hash; this binds the plaintext to it. Whoever holds
  // the enclave public key can seal any policy under any hash, so the check is what makes the
  // chain's commitment mean something.
  if (hashPolicy(policy) !== policyHash) {
    throw new Error("the sealed policy does not hash to the committed policy hash");
  }

  return policy;
}
