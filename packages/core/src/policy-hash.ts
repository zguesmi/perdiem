import type { Policy } from "./policy.ts";

/**
 * The commitment the buyer places on chain before any bid exists.
 *
 * `policyHash = keccak256(utf8Bytes(canonicalJson(policy)))`
 */
export function policyHash(_policy: Policy): `0x${string}` {
  throw new Error(
    "policyHash is not implemented yet. See docs/scratch/build/01-policy-schema-and-scoring-formula.md",
  );
}
