/**
 * The one canonical JSON encoder. Every package that hashes a Policy uses this function and no
 * other, because the desk and the enclave have to produce byte-identical output or the settlement
 * is rejected on chain.
 *
 * Rules: object keys sorted, no insignificant whitespace, UTF-8.
 */
export function canonicalJson(_value: unknown): string {
  throw new Error(
    "canonicalJson is not implemented yet. See docs/scratch/build/01-policy-schema-and-scoring-formula.md",
  );
}
