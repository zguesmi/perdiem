# Turn one sentence into a Policy

Status: ready-for-agent Type: task Blocked by: 01, 21

This ticket and 21 overlap: 21 writes the prompt this ticket calls and installs the model client
seam it is tested through. Whether they should be one ticket is open.

One LLM call, a fixed system prompt stored at `docs/ai/intent-prompt.md`, and validation against the
Policy schema. One retry, then fail.

The service converts what the buyer says into flat numbers before they confirm: "12% more" and "20 a
night" become the actual USDC each preference is worth on this trip. The buyer confirms concrete
numbers, not a formula.

## Acceptance criteria

- [ ] `POST /intent` makes one model call with the prompt at `docs/ai/intent-prompt.md` and
      validates the result against the Policy schema.
- [ ] Invalid output is retried exactly once, then the call fails with no Policy Hash computed and
      nothing written on chain.
- [ ] Every number in the returned Policy is an integer, in USDC minor units, metres or
      microdegrees.
- [ ] `POST /confirm` canonicalizes, hashes, uploads the workflow secrets, then calls
      `createAuction`, in that order.
- [ ] The buyer confirms concrete numbers. No percentage or per-night formula survives into the
      Policy.

## Comments

## Dev review

Not reviewed yet.
