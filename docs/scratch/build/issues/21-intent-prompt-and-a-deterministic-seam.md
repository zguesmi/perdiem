# Write the intent system prompt, and make the requisition service testable without an LLM

Status: ready-for-agent
Blocked by: 01

Two gaps, one ticket, because they are the same boundary.

**The prompt does not exist.** `docs/spec.md` and ticket 10 both point at `docs/ai/intent-prompt.md`,
and the file is not in the repository. `docs/ai/README.md` has an empty `## Prompts` section waiting
for it. ETHGlobal requires every prompt to be in the repository, so this is a submission requirement
and not a nicety.

The prompt has to state: the exact Policy schema from `docs/spec.md`, integers only, USDC minor
units, metres, microdegrees, and the conversion the service is responsible for — "12% more" and "20 a
night" become flat per-trip numbers before the buyer sees them. It also has to state what the model
must not invent: no preference the sentence does not mention, and no maximum price the sentence does
not imply.

**The test seam.** `requisition/test/intent.test.ts` exists but a test that calls a real model is not
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
- One live test, skipped unless a key is present, so the real prompt is exercised by hand before the
  demo and never in continuous integration.

Also record which model parses the intent, in `docs/ai/README.md` beside the prompt. The README's AI
attribution section names the model used for the build; the model used at runtime is a separate fact
and judges will read it as one.

## Comments
