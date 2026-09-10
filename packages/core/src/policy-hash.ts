import { keccak256, toBytes } from "viem";

import { canonicalJson } from "./canonical-json.ts";

/**
 * The commitment the buyer places on chain before any Bid exists.
 *
 * `policyHash = keccak256(utf8Bytes(canonicalJson(policy)))`
 *
 * The argument is `unknown` rather than `Policy` so a candidate that has not passed
 * `policySchema` can still be hashed. Validation is the caller's job; this function only hashes.
 */
export function policyHash(policy: unknown): `0x${string}` {
  return keccak256(toBytes(canonicalJson(policy)));
}
