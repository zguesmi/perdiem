# @perdiem/workflow-cre

The Chainlink CRE workflow. A cron trigger asks the chain whether an auction is ready, the workflow
claims it with a claim report, and the confidential handler does the rest.

What happens inside `handlerInTee`, and nowhere else:

- The enclave private key is loaded from workflow secrets.
- The sealed policy is fetched from the relay by the policy hash the chain carries, opened, and
  rejected unless it hashes back to that hash.
- The sealed bids are fetched from the relay and decrypted.
- Every bid's EIP-712 signature is checked, then its commitment is checked against the chain.
- The bids root is built over **all** on-chain commitments, including any committer whose sealed bid
  never arrived. Building it over only the scored bids would turn one missing blob into a dead
  auction.
- Eligibility, scoring, and the winner.
- The booking, which is the only step still missing.

Only the settlement leaves the enclave. The policy, the maximum price, the preferences, the enclave
private key and every decrypted bid stay inside it, and none of them are ever logged.

## Layout

The CRE project root and the workflow folder are the same directory, so there is one `package.json`
and one `tsconfig.json` rather than two of each.

| File              | What it is                                                                |
| ----------------- | ------------------------------------------------------------------------- |
| `project.yaml`    | Targets and their RPCs. `${ARC_RPC_URL}` resolves from the `.env`         |
| `workflow.yaml`   | Which entry point, config and secrets file each target uses               |
| `config.json`     | Written by `pnpm run config` from the `.env`, validated by `configSchema` |
| `secrets.yaml`    | Secret id to environment variable name. It holds no values                |
| `src/main.ts`     | The entry point. It must export `main`                                    |
| `src/workflow.ts` | The cron trigger and the confidential handler                             |

The CRE CLI generates all six, plus `package.json` and `tsconfig.json`. Regenerating the template
overwrites the shape of every one of them, so local edits to those eight files are the edits to
re-apply by hand.

`config.json` carries the `SealedAuction` address, which changes on every deploy, so it is generated
rather than committed: `pnpm run config <network>` reads `.env.<network>` and writes it. The CRE CLI
expands nothing inside a config file, which is why `project.yaml` can hold `${ARC_RPC_URL}` and this
one cannot.

Both targets exist and both simulate. They differ by name only, because nothing is deployed and
`cre workflow simulate` runs either. Two targets mean `--target` is no longer optional.

## Secrets in simulation

`secrets.yaml` maps the id the handler asks for to the name of an environment variable:

```yaml
secretsNames:
  ENCLAVE_PRIVATE_KEY:
    - ENCLAVE_PRIVATE_KEY
```

The file holds no values. The CLI reads them from the process environment, so the `.env` has to be
passed explicitly with `-e`; a file sitting next to `project.yaml` is not picked up. The `simulate`
script passes `../.env.arcTestnet`.

Three rules the CLI enforces, all of them at compile time rather than at run time:

- Every variable named in `secrets.yaml` must exist, whether or not a handler reads it. A missing
  one fails with `environment variable ENCLAVE_PRIVATE_KEY for secret value not found`.
- An empty value is accepted. That is what keeps `ENCLAVE_PRIVATE_KEY=` in the `.env` while the
  handler that reads it is still being written.
- One secret holds at most 131,072 bytes, which is the operating system's `exec` limit. The enclave
  private key is 44 characters.

The enclave private key is the only secret. The Policy reaches the handler sealed, through the
relay, keyed by its Policy Hash. See `docs/adr/0008-the-policy-travels-through-the-relay.md`.

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
pnpm --dir workflow-cre test                # tsx --test over test/**/*.test.ts
pnpm --dir workflow-cre typecheck           # tsc --noEmit
pnpm --dir workflow-cre config              # write config.json from .env.arcTestnet
pnpm --dir workflow-cre config localhost    # the same, from .env.localhost
pnpm --dir workflow-cre simulate            # config, then cre workflow simulate
pnpm --dir workflow-cre simulate localhost  # the same, against the local node
```

Both commands take a network, named after the Hardhat network and its `.env.<network>` file, and
default to `arcTestnet`. The CRE chain name is not one of those values: the local node runs with
`--chain-id $ARC_CHAIN_ID`, so both networks are chain 5042002 and both answer to `arc-testnet`.
`project.yaml` reads `${ARC_RPC_URL}`, which each file sets to its own node.

`simulate` needs `ARC_RPC_URL` in the file it reads, because the CLI checks every RPC in
`project.yaml` before it compiles, and it needs every variable `secrets.yaml` names.

## Status

The handler runs the whole pipeline: the cron read, the claim report, the policy, the sealed bids,
the signature and commitment checks, the bids root, scoring and the settlement report. The booking
is the one seam still open, and until it closes the enclave reports no winner, which refunds the
payout cap and every stake.

Evidence rule: a fake runner may execute the handler while it is being built. Only
`cre workflow simulate` produces the logs in `docs/scratch/verification/evidence/`.
