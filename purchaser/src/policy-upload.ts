import { bytesToHex } from "viem";

/**
 * Puts the sealed policy at the relay, under the hash the auction will commit to.
 *
 * The relay is blind, so this sends bytes and nothing else. First write wins, so a hash already
 * uploaded answers `409` and the buyer never opens a second auction behind it.
 */
export type PolicyUploader = (policyHash: `0x${string}`, envelope: Uint8Array) => Promise<void>;

export function createPolicyUploader(relayUrl: string): PolicyUploader {
  return async (policyHash, envelope) => {
    const response = await fetch(`${relayUrl}/policies/${policyHash}`, {
      method: "PUT",
      body: bytesToHex(envelope),
    });

    // `409` means this hash already carries a ciphertext, which a retried confirm produces every
    // time: the hash is deterministic, and the relay is first-write-wins. Treated as done, because
    // whatever sits there only opens as a policy hashing to this hash, and the enclave checks that.
    // Cost: a hash somebody poisoned before the buyer uploaded yields an auction that refunds on
    // timeout rather than a 502 the buyer sees at once.
    if (response.status !== 201 && response.status !== 409) {
      throw new Error(`the relay refused the sealed policy with ${response.status}`);
    }
  };
}
