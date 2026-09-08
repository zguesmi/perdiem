# @perdiem/workflow

The Chainlink CRE workflow. A cron trigger asks the chain whether an auction is ready, the workflow
claims it with `startSettling`, and the confidential handler does the rest.

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

## Why this package is outside the pnpm workspace

`cre init --template=hello-confidential-workflows-ts` generates and regenerates this package's
`package.json`. A workspace member it does not know about is a member it will overwrite. So this
package installs on its own and reaches the shared code through a `file:` dependency:

```json
"dependencies": { "@perdiem/core": "file:../packages/core" }
```

It also carries its own `pnpm-workspace.yaml`, which stops pnpm walking up to the repository root.
Without it, `pnpm install` here silently installs the root workspace instead of this package:

```sh
pnpm --dir workflow install
pnpm --dir workflow test
```

If the CRE CLI ever drops that line, the hashing tests fail loudly rather than the demo failing
quietly at settlement. Adding this package to the workspace is worth revisiting once the CLI's
behaviour is verified.

## Commands

This package is outside the pnpm workspace, so the root scripts skip it and it installs on its own.

```sh
pnpm --dir workflow install
pnpm --dir workflow test        # tsx --test over test/**/*.test.ts
pnpm --dir workflow typecheck   # tsc --noEmit
```

There is no build script, and no `cre` command yet: the CRE CLI is not installed and Confidential
Workflows is in private beta. Once it is generated, the simulation run that produces the evidence in
`docs/evidence/` is:

```sh
cre workflow simulate
```

## Status

The CRE scaffolding is not generated yet: the CLI is not installed, and Confidential Workflows is in
private beta. What is here is the scoring rule, stubbed, and the demo table as a red test.

Evidence rule: a fake runner may execute the handler while it is being built. Only
`cre workflow simulate` produces the logs in `docs/evidence/`.
