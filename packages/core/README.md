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
pnpm --filter @perdiem/core test        # tsx --test over test/**/*.test.ts
pnpm --filter @perdiem/core typecheck   # tsc --noEmit
pnpm --filter @perdiem/core build       # emits dist/, only workflow/ needs it
```

Nothing here is served or started; this package is a library.

## Status

The canonical encoder, the `Policy` schema and the Policy Hash are implemented, and the golden
fixture the Enclave asserts against is `test/fixtures/policy-hash.json`: the Policy, its canonical
bytes and its hash. Regenerate it whenever the schema changes, and bump `version` when you do.

`USDC_DECIMALS` is 6, the fixed decimal count of USDC on Arc. Other files may spell out 6.

Bid hashing and the Bids Root are not here yet. They arrive with
`docs/scratch/build/issues/03-eip712-bid-hashing-and-commitments.md`.
