# Agree the Policy schema and the scoring formula

Status: ready-for-human

Nothing else starts until this is settled. Six packages hash, validate or score against this
shape, and every one of them is written twice if it moves.

What has to come out of it:

- The Policy JSON, field by field, in USDC minor units. `preferences` is a map from attribute to a
  flat bonus: `{ refundable: 50, breakfastIncluded: 40 }`. The attribute implies what the number
  means.
- The exact eligibility rules, including how Trade-Down compares against the cheapest eligible bid at
  the minimum star level, and what happens when there is no such bid.
- The score formula, `score = (maxPrice - price) + preferenceBonus`, with the note that the maximum
  price term is identical for every bid and therefore cannot change the ranking. It stays for
  readability.
- Tie-breaks: lower price, then lower supplier address.
- The canonical JSON rules: sorted keys, no insignificant whitespace, UTF-8.

Write the result into `docs/spec.md` and the vocabulary into `CONTEXT.md`.

## Comments
