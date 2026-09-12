# Turn one sentence into a Policy

Status: resolved Type: task Blocked by: 01, 21

This ticket and 21 overlap: 21 writes the prompt this ticket calls and installs the model client
seam it is tested through. Whether they should be one ticket is open.

One model call, a fixed system prompt stored at `purchaser/prompts/intent.md`, and validation
against the Policy schema. One retry, then fail.

The service converts what the buyer says into flat numbers before they confirm: "12% more" and "20 a
night" become the actual USDC each preference is worth on this trip. The buyer confirms concrete
numbers, not a formula.

## Acceptance criteria

- [x] `POST /intent` makes one model call with the prompt at `purchaser/prompts/intent.md` and
      validates the result against the Policy schema.
- [x] Invalid output is retried exactly once, then the call fails with no Policy Hash computed and
      nothing written on chain.
- [x] Every number in the returned Policy is an integer, in USDC minor units.
- [x] `POST /confirm` canonicalizes and hashes.
- [x] The buyer confirms concrete numbers. No percentage or per-night formula survives into the
      Policy.

## Comments

The prompt lives at `purchaser/prompts/intent.md`, not `docs/ai/intent-prompt.md`. The model client
is injected, so the route tests run against a canned answer with no key and no network.

The funding half of `POST /confirm` is
[11 — Privy funding with a quorum](11-privy-funding-with-quorum.md): uploading the workflow secrets
and calling `createAuction`. `POST /confirm` hashes the Policy and returns it.

Units dropped metres and microdegrees. Ticket 27 removed location, distance and radius.

## Dev review

Not reviewed yet.
