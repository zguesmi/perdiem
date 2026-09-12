# @perdiem/workflow-cre

The Chainlink CRE workflow. A cron trigger asks the chain whether an auction is ready, the workflow
claims it with a claim report, and the confidential handler does the rest.

What happens inside `handlerInTee`, and nowhere else:

- The Policy and the enclave private key are loaded from workflow secrets.
- The sealed bids are fetched from the relay and decrypted.
- Every bid's EIP-712 signature is checked, then its commitment is checked against the chain.
- The bids root is built over **all** on-chain commitments, including any committer whose sealed bid
  never arrived. Building it over only the scored bids would turn one missing blob into a dead
  auction.
- Eligibility, scoring, and the winner.

Only the settlement leaves the enclave. The policy, the maximum price, the preferences, the enclave
private key and every decrypted bid stay inside it, and none of them are ever logged.

## Layout

The CRE project root and the workflow folder are the same directory, so there is one `package.json`
and one `tsconfig.json` rather than two of each.

| File              | What it is                                                        |
| ----------------- | ----------------------------------------------------------------- |
| `project.yaml`    | Targets and their RPCs. `${ARC_RPC_URL}` resolves from the `.env` |
| `workflow.yaml`   | Which entry point and which config each target uses               |
| `config.json`     | The workflow's own config, validated by `configSchema`            |
| `src/main.ts`     | The entry point. It must export `main`                            |
| `src/workflow.ts` | The cron trigger and the confidential handler                     |

The CRE CLI generates all five, plus `package.json` and `tsconfig.json`. Regenerating the template
overwrites the shape of every one of them, so local edits to those seven files are the edits to
re-apply by hand.

## Why this package is outside the pnpm workspace

`cre init` generates and regenerates this package's `package.json`. A workspace member it does not
know about is a member it will overwrite. So this package installs on its own, and it reaches the
shared code through a relative import rather than a dependency entry the CLI could drop:

```ts
import type { Policy } from "../../shared/policy.ts";
```

It also carries its own `pnpm-workspace.yaml`, which stops pnpm walking up to the repository root.
Without it, `pnpm install` here silently installs the root workspace instead of this package.

Two `tsconfig.json` settings survive a regeneration only if they are re-applied:

- `allowImportingTsExtensions`, which `../tsconfig.base.json` sets. Without it the typecheck the CLI
  runs before compiling rejects every `.ts` import path in `shared/`.
- `moduleResolution: "bundler"`. `@chainlink/cre-sdk` publishes its types through `exports` only,
  and Node20 resolution finds none of them.

A relative import that leaves the project root compiles into the WASM binary and runs inside the
enclave. Verified with `canonicalJson` from `shared/`.

## Commands

This package is outside the pnpm workspace, so the root scripts skip it and it installs on its own.

```sh
pnpm --dir workflow-cre install
pnpm --dir workflow-cre test        # tsx --test over test/**/*.test.ts
pnpm --dir workflow-cre typecheck   # tsc --noEmit
pnpm --dir workflow-cre simulate    # cre workflow simulate, reading ../.env.arcTestnet
```

`simulate` needs `ARC_RPC_URL` in `.env.arcTestnet`, because the CLI checks every RPC in
`project.yaml` before it compiles.

## Status

The scaffolding runs and the handler is a placeholder: it logs that the enclave was reached and
reports no pending auction. The scoring rule is stubbed, with the demo table as a red test.

Evidence rule: a fake runner may execute the handler while it is being built. Only
`cre workflow simulate` produces the logs in `docs/scratch/verification/evidence/`.
