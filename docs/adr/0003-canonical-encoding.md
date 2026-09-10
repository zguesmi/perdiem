# Canonical encoding is one shared function over integers

The Policy Hash is computed twice: once by the requisition service, before the buyer confirms, and
once by the Enclave, before it reports a Settlement. The contract compares them. If the two bytes
disagree by one byte, the settlement is rejected and the auction dies in `timeoutRefund` with no
winner and no diagnostic beyond "hash mismatch".

Both callers are TypeScript, and both import `canonicalJson` from `shared/`. They agree because they
run the same code, not because two implementations obey one specification. That is the whole
decision.

"Sorted keys, no insignificant whitespace, UTF-8" would not pin the bytes down on its own. Two
implementations that both obey it can still differ on number formatting, on key ordering by UTF-16
code unit against by code point, on absent against present-and-null, and on string escaping. One
function answers all four by construction:

- keys sort by `<` on the key string, which compares UTF-16 code units;
- `null` and `undefined` are rejected, so absent and present-and-null never both appear;
- every number must be a safe integer, so no fraction, no exponent, and no shortest-round-trip
  question. Money is USDC minor units, distance is metres, coordinates are microdegrees;
- strings are escaped by `JSON.stringify`.

## What we rejected

The first version implemented RFC 8785, the JSON Canonicalization Scheme, with four vendored
reference vectors and a conformance test: 131 lines against the 34 lines here.

RFC 8785 buys agreement between implementations that cannot see each other. We have one
implementation. Its cost was 97 lines of guards against inputs the Policy schema already rejects:
`policySchema` is `.strict()` at every level and every number is `z.int()`, so a lone surrogate, an
array hole, a bigint or a `Date` cannot reach the encoder from a validated Policy.

Both versions hash the Policy in `docs/spec.md` to the same 32 bytes,
`0xcf8e8d0c8679bb6c91011ea5d77ef5f4e44efcce1846bec48aa1ddcc2235ea8c`.

## Consequences

`shared/canonical-json.ts` is the only encoder. Anything that hashes a Policy imports it. The
canonical bytes and the hash for the Policy in `docs/spec.md` are asserted as literals in
`shared/policy-hash.test.ts`, so changing the encoder or the Policy fails a test.

`null` is not representable in a Policy. Optional fields are absent or present, never null.

A future Policy that needs a rate rather than a flat number carries it as basis points, not as a
fraction.

This decision holds only while every caller is TypeScript. A supplier agent, a service or an enclave
runtime in another language would have to reimplement the encoder, and then RFC 8785 and a
cross-language fixture come back.
