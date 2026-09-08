# Agree the Policy schema and the scoring formula

Status: resolved Type: task

Nothing else starts until this is settled. Six packages hash, validate or score against this shape,
and every one of them is written twice if it moves.

What has to come out of it:

- The Policy JSON, field by field, in USDC minor units. `preferences` is a map from attribute to a
  flat bonus: `{ refundable: 50, breakfastIncluded: 40 }`. The attribute implies what the number
  means.
- The exact eligibility rules, including how Trade-Down compares against the cheapest eligible bid
  at the minimum star level, and what happens when there is no such bid.
- The score formula, `score = (maxPrice - price) + preferenceBonus`, with the note that the maximum
  price term is identical for every bid and therefore cannot change the ranking. It stays for
  readability.
- Tie-breaks: lower price, then lower supplier address.
- The canonical JSON rules: sorted keys, no insignificant whitespace, UTF-8.

Write the result into `docs/spec.md` and the vocabulary into `CONTEXT.md`.

## Answer

Settled in `docs/spec.md`. The schema is under "Policy", the eligibility rules and the score formula
are under "Scoring", and the canonical encoding rule is `docs/adr/0003-canonical-encoding.md`. Code
may be written against all three.

Four things this ticket had left implicit, now decided:

- **Integers only, everywhere.** Money in USDC minor units, distance in metres (`distanceMeters`,
  `radiusMeters`), coordinates in microdegrees. The old `distanceKm` was a fraction, and a fraction
  in a hashed document is a hash divergence waiting to happen. The demo distances are 500, 700 and
  1000 metres.
- **The decimal count is one constant.** It comes from
  `../../verification/issues/05-arc-usdc-address-and-decimals.md` and lives in `packages/core`. If
  it is 18 rather than 6, only the fixture regenerates; no rule changes, because every comparison in
  scoring is between two amounts in the same unit.
- **Canonical encoding is RFC 8785 restricted to integers**, not the looser "sorted keys, no
  whitespace, UTF-8" prose, which two conformant implementations can satisfy while producing
  different bytes. `packages/core` ships a golden fixture that both the requisition service and the
  Enclave assert against.
- **`version`, `currency` and `nights` stay in the hash and are read by nothing during scoring.**
  Their purpose is written down in `docs/spec.md` so nobody later removes them as dead fields and
  changes every Policy Hash.

Downstream of this: 02, 03, 06 and 10 are unblocked. 04 remains blocked on the USDC decimals.

## Comments
