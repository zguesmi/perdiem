# @perdiem/workflow-cre

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

`cre init` generates and regenerates this package's `package.json`. A workspace member it does not
know about is a member it will overwrite. So this package installs on its own, and it reaches the
shared code through a relative import rather than a dependency entry the CLI could drop:

```ts
import type { Policy } from "../../shared/policy.ts";
```

It also carries its own `pnpm-workspace.yaml`, which stops pnpm walking up to the repository root.
Without it, `pnpm install` here silently installs the root workspace instead of this package:

```sh
pnpm --dir workflow-cre install
pnpm --dir workflow-cre test
```

One requirement survives the CLI regenerating `tsconfig.json`: it must set
`allowImportingTsExtensions`. Without it the typecheck the CLI runs before compiling rejects every
`.ts` import path in `shared/`, with
`An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled`.

## Commands

This package is outside the pnpm workspace, so the root scripts skip it and it installs on its own.

```sh
pnpm --dir workflow-cre install
pnpm --dir workflow-cre test        # tsx --test over test/**/*.test.ts
pnpm --dir workflow-cre typecheck   # tsc --noEmit
```

There is no build script yet, because the CRE scaffolding is not generated. Once it is, the
simulation run that produces the evidence in `docs/scratch/verification/evidence/` is:

```sh
cre workflow simulate
```

## Status

The CRE scaffolding is not generated yet, and Confidential Workflows is in private beta. What is
here is the scoring rule, stubbed, and the demo table as a red test.

Evidence rule: a fake runner may execute the handler while it is being built. Only
`cre workflow simulate` produces the logs in `docs/scratch/verification/evidence/`.
