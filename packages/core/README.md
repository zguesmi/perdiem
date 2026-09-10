# @perdiem/core

What every other package has to agree on: the domain types, their schemas, the canonical JSON
encoder, and the hashes built from it.

Scoring is deliberately **not** here. It is in `workflow/`, so that no supplier agent can import the
rule it is bidding against. See `docs/adr/0002-scoring-is-not-shared.md`.

`workflow/` sits outside the pnpm workspace and depends on this package through a `file:` path. The
fixture test on both sides fails loudly if that dependency is ever dropped.

## Resolution

`main` and `types` point at `src/index.ts`, not at `dist`. Everything in this workspace runs
TypeScript directly, with tsx for the services and Hardhat for the contracts, so a consumer needs no
build step and cannot typecheck against a stale `dist`. The `build` script still exists, because
`workflow/` lives outside the workspace and may need compiled JavaScript.

## Commands

Run from the repository root, after `pnpm install`.

```sh
pnpm --filter @perdiem/core test              # tsx --test over test/**/*.test.ts
pnpm --filter @perdiem/core typecheck         # tsc --noEmit
pnpm --filter @perdiem/core build             # emits dist/ JavaScript, not the fixture JSON
pnpm --filter @perdiem/core generate:fixture  # rewrites src/golden-policy.json
```

Nothing here is served or started; this package is a library.

## The golden fixture

`src/golden-policy.json` holds the Policy from `docs/spec.md`, its canonical bytes and its Policy
Hash. `test/policy-hash.test.ts` reads the expected values from it. Once the requisition service and
the enclave assert against the same file, a divergence between the two encoders fails a test instead
of an auction.

The file is generated. Change the schema or `goldenPolicy`, bump `version`, then run
`generate:fixture`. Never edit the JSON by hand.

Ticket 19 extends the fixture to `bidHash`, the Bid Commitment and the Bids Root.

## Status

`canonicalJson`, `policyHash`, `policySchema` and the fixture are implemented. `settle` lives in
`workflow/` and is ticket 06.
