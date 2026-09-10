# shared

Everything the buyer, the suppliers and the enclave have to agree on: the Policy schema, the
canonical encoding, the Policy Hash, the three bid hashes and the sealed bid envelope. Scoring is
not here, and never will be — see `docs/adr/0002-scoring-is-not-shared.md`.

- `policy.ts`, `canonical-json.ts`, `policy-hash.ts` — the Policy and its commitment.
- `bid.ts` — the EIP-712 bid struct hash, the signing digest, the bid commitment and the bids root.
- `sealed-bid.ts` — sealing a bid to the enclave key and opening it inside the enclave. The scheme
  is in `docs/adr/0005-sealed-bid-envelope-scheme.md`.
- `chain.ts` — the Arc chain id, which the EIP-712 domain reads.

This is a plain directory, not a package. Every consumer imports it by relative path:

```ts
import { policyHash } from "../../shared/policy-hash.ts";
```

`zod`, `viem` and the three `@noble/*` packages are declared in the repository root `package.json`,
because Node resolves a bare specifier from the location of the file that imports it, not from the
location of the importer.

## Why not a package

`workflow/` cannot be a workspace member: the Chainlink CRE CLI owns its `package.json` and
overwrites entries it did not write. A package therefore had to reach it through a `file:`
dependency, which pnpm hard-links, so `workflow/` kept seeing a stale copy until someone re-ran
`pnpm install` inside it. A relative import has no copy to go stale.

Verified against `cre workflow build` (CLI 1.32.0): a relative import that leaves the CRE project
root compiles into the WASM binary. One requirement — the generated `tsconfig.json` must set
`allowImportingTsExtensions`, or every `.ts` import path in this directory fails the typecheck the
CLI runs before compiling.

## Commands

Tests and typecheck run from the repository root, because this directory has no scripts of its own.

```sh
pnpm test        # runs shared/*.test.ts, then every workspace member
pnpm typecheck   # tsc --noEmit over shared/, then every workspace member
```
