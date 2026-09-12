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

| File                     | What it is                                                        |
| ------------------------ | ----------------------------------------------------------------- |
| `project.yaml`           | Targets and their RPCs. `${ARC_RPC_URL}` resolves from the `.env` |
| `workflow.yaml`          | Which entry point, config and secrets file each target uses       |
| `config.json`            | The workflow's own config, validated by `configSchema`            |
| `config.production.json` | The same, for the production target                               |
| `secrets.yaml`           | Secret id to environment variable name. It holds no values        |
| `src/main.ts`            | The entry point. It must export `main`                            |
| `src/workflow.ts`        | The cron trigger and the confidential handler                     |

The CRE CLI generates all seven, plus `package.json` and `tsconfig.json`. Regenerating the template
overwrites the shape of every one of them, so local edits to those nine files are the edits to
re-apply by hand.

Both targets exist and both simulate. They differ by name only, because nothing is deployed and
`cre workflow simulate` runs either. Two targets mean `--target` is no longer optional.

## Secrets in simulation

`secrets.yaml` maps the id the handler asks for to the name of an environment variable:

```yaml
secretsNames:
  POLICY:
    - POLICY
```

The file holds no values. The CLI reads them from the process environment, so the `.env` has to be
passed explicitly with `-e`; a file sitting next to `project.yaml` is not picked up. The `simulate`
script passes `../.env.arcTestnet`.

Three rules the CLI enforces, all of them at compile time rather than at run time:

- Every variable named in `secrets.yaml` must exist, whether or not a handler reads it. A missing
  one fails with `environment variable POLICY for secret value not found`.
- An empty value is accepted. That is what keeps `POLICY=` in the `.env` while the handler that
  reads it is still being written.
- One secret holds at most 131,072 bytes, which is the operating system's `exec` limit. The Policy
  is 425 characters and the enclave private key is 44.

Inside the handler, `runtime.getSecret({ id }).result().value` returns the text. On a deployment the
Vault DON releases it straight into the attested enclave; in simulation there is no enclave, so
nothing here is confidential. Verified with a probe that logged `policyChars` and `skChars` and
never a value.

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
pnpm --dir workflow-cre simulate    # cre workflow simulate against the staging target
```

`simulate` needs `ARC_RPC_URL` in `.env.arcTestnet`, because the CLI checks every RPC in
`project.yaml` before it compiles, and it needs every variable `secrets.yaml` names.

## Status

The scaffolding runs and the handler is a placeholder: it logs that the enclave was reached and
reports no pending auction. The scoring rule is implemented and the demo table is green.

Evidence rule: a fake runner may execute the handler while it is being built. Only
`cre workflow simulate` produces the logs in `docs/scratch/verification/evidence/`.
