# Canonical encoding is RFC 8785, restricted to integers

The Policy Hash is computed twice: once by the requisition service, in TypeScript, before the buyer
confirms, and once by the Enclave, in the confidential handler, before it reports a Settlement. The
contract compares them. If the two encoders disagree by a single byte, the settlement is rejected
and the auction dies in `timeoutRefund` with no winner and no diagnostic beyond "hash mismatch".

"Sorted keys, no insignificant whitespace, UTF-8" does not pin that down. Two implementations that
both obey it can still differ on:

- number formatting: `1e3` against `1000`, `2.0` against `2`, and the shortest round-trip form of a
  fraction;
- key ordering: by UTF-16 code unit against by code point, which differ once a key contains a
  character outside the basic multilingual plane;
- absent against present-and-null;
- string escaping: `é` against the literal character.

So the rule is RFC 8785, the JSON Canonicalization Scheme, which answers all four, plus one
restriction of our own: every number in a Policy or a Bid is an integer within the safe-integer
range. No fractions, no exponents. Money is USDC minor units, distance is metres, coordinates are
microdegrees.

The restriction is what makes RFC 8785 safe here. Its number rule is ECMAScript's
`Number::toString`, which is exact and unambiguous for integers and merely well-defined for
fractions — well-defined is enough for a conformant implementation and not enough for a hand-written
one, and the Enclave runtime is where a hand-written one is most likely to appear.

## Consequences

`packages/core` exports one encoder and one golden fixture: a Policy, its canonical bytes, and its
hash. The requisition service and the Enclave both assert against that fixture, so a divergence
fails a test instead of an auction. The fixture is regenerated whenever the schema changes, and a
schema change bumps `version`.

`null` is not representable in a Policy. Optional fields are absent or present, never null.

A future Policy that needs a rate rather than a flat number carries it as basis points, not as a
fraction.
