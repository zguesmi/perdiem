# @perdiem/core

What every other package has to agree on: the domain types, their schemas, the canonical JSON
encoder, and the hashes built from it.

Scoring is deliberately **not** here. It lives in `workflow/`, so that no supplier agent can import
the rule it is bidding against. See `docs/adr/0002-scoring-is-not-shared.md`.

`workflow/` sits outside the pnpm workspace and depends on this package through a `file:` path. The
fixture test on both sides fails loudly if that dependency is ever dropped.

## Resolution

`main` and `types` point at `src/index.ts`, not at `dist`. Everything in this workspace runs
TypeScript directly — tsx for the services, Hardhat for the contracts — so a consumer needs no build
step and cannot typecheck against a stale `dist`. The `build` script still exists, because
`workflow/` lives outside the workspace and may need compiled JavaScript.

## Status

Every function throws. The tests state what they must do, and they are red until
`.scratch/build/01-policy-schema-and-scoring-formula.md` is resolved. Nothing is written against the
`Policy` type until then.
