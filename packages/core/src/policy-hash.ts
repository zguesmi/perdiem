import { keccak256, toBytes } from "viem";

import { canonicalJson } from "./canonical-json.ts";
import type { Policy } from "./policy.ts";

/**
 * The commitment the buyer places on chain before any Bid exists.
 *
 * `policyHash = keccak256(utf8Bytes(canonicalJson(policy)))`
 *
 * The Enclave recomputes this from the same document and the contract compares the two, so the
 * only safe input is a Policy that has already been validated against `policySchema`. Hashing is
 * not validation and does not pretend to be: an extra key would be hashed, not rejected.
 */
export function policyHash(policy: Policy): `0x${string}` {
  return keccak256(toBytes(canonicalJson(policy)));
}
