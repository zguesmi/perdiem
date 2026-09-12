# Write the intent system prompt, and make the purchaser service testable without an LLM

Status: resolved Type: task Blocked by: 01

Two gaps, one ticket, because they are the same boundary.

**The prompt does not exist.** `docs/spec.md` and ticket 10 both point at
`docs/ai/intent- prompt.md`, and the file is not in the repository. `docs/ai/README.md` has an empty
`## Prompts` section waiting for it. ETHGlobal requires every prompt to be in the repository, so
this is a submission requirement and not a nicety.

The prompt has to state the exact Policy schema from `docs/spec.md`, integers only, USDC minor
units, metres, microdegrees, and the conversion the service is responsible for. "12% more" and "20 a
night" become flat per-trip numbers before the buyer sees them. It also has to state what the model
must not invent: no preference the sentence does not mention, and no maximum price the sentence does
not imply.

**The test seam.** `purchaser/test/intent.test.ts` exists but a test that calls a real model is not
a test: it is slow, it costs money, it needs a key in continuous integration, and it fails for
reasons that have nothing to do with the code. The seam is the model client, injected into the
service, so the tests drive the service through its HTTP surface with a stub that returns a canned
completion.

What the tests then state, at the HTTP level and with no network:

- A good completion becomes a valid Policy, and `POST /confirm` hashes it to the fixture's hash.
- A completion that fails schema validation is retried exactly once.
- A second failure returns an error, and no Policy Hash is computed and nothing is written on chain.
- A completion carrying a fractional price is rejected, not rounded. Rounding silently changes what
  the buyer confirmed.
- One live test, skipped unless a key is present, so a human runs the real prompt by hand before the
  demo and never in continuous integration.

Also record which model parses the intent, in `docs/ai/README.md` beside the prompt. The README's AI
attribution section names the model used for the build; the model used at runtime is a separate fact
and judges will read it as one.

## Acceptance criteria

- [x] `purchaser/prompts/intent.md` exists and states the exact Policy schema, integers only, USDC
      minor units, and the conversion the service owns.
- [x] The prompt states what the model must not invent: no preference the sentence does not mention,
      no maximum price the sentence does not imply.
- [x] The model client is injected, and the HTTP tests run against a stub with no network.
- [x] A good completion becomes a valid Policy, and `POST /confirm` hashes it to the fixture's hash.
- [x] A schema failure is retried exactly once. A second failure returns an error, with no Policy
      Hash and no chain write.
- [x] A fractional price in the completion is rejected, not rounded.
- [x] One live test exists, skipped unless a key is present, so it never runs in continuous
      integration.
- [x] `purchaser/README.md` records the runtime model beside the prompt, separately from the build
      model in the root README.

## Comments

Done, with two deliberate departures from the text above.

The prompt lives at `purchaser/prompts/intent.md`, not `docs/ai/`. It is code the service reads at
startup, it sits beside `supplier/prompts/`, and a prompt two directories from the schema it has to
match goes stale without anyone noticing. The runtime model is recorded in `purchaser/README.md` for
the same reason. Nothing under `docs/ai/` was created.

Metres and microdegrees are gone from the prompt: ticket 27 took location, distance and radius out
of the Policy, so the schema has no such field left to describe.

The seam is `Completer`, a function of the sentence and today's date returning `unknown`. Validation
and the retry belong to the service, so a completer that could only return a valid Policy would make
the validation unreachable. Today's date is injected too, which is how "12 October" resolves to a
year without the tests depending on the day they run.

`POST /confirm` hashes and returns the public requirements. It does not upload the workflow secrets
or call `createAuction`: that half is ticket 10 and ticket 11.

The prompt itself is unverified. `purchaser/test/live-intent.test.ts` is the only test that would
run it against a real model, and it skipped: no `ANTHROPIC_API_KEY` was available. A human has to
run it once before the demo.

## Dev review

Not reviewed yet.
