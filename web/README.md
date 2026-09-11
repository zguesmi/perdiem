# @perdiem/web

One page, five panels, read top to bottom during the demo:

1. **Intent** — the sentence, the parsed policy, the policy hash and its block number.
2. **Funding** — budget, ceiling, Privy quorum approvals, the `createAuction` transaction.
3. **Bids** — commitment hashes only until settlement, then the full bids, so the audience sees why
   the cheapest one lost.
4. **Enclave** — a live tail of the simulation log. The policy never appears here.
5. **Settlement** — winner, payout, refund, stake refunds, booking id.

No design work beyond a clean default. No mobile layout.

## Configuration

This package keeps the `tsconfig.json`, `vite.config.ts` and lint setup that `pnpm create vite`
generated, rather than extending `tsconfig.base.json`. Same rule as `onchain/`: where a tool owns
its configuration, the generated file is left alone.

## Commands

Run from the repository root, after `pnpm install`.

```sh
pnpm --filter @perdiem/web dev         # vite dev server on port 5173
pnpm --filter @perdiem/web build       # tsc -b, then vite build into dist/
pnpm --filter @perdiem/web preview     # serves the built dist/
pnpm --filter @perdiem/web typecheck   # tsc -b
pnpm --filter @perdiem/web lint        # oxlint
```

This package has no test script.

## Status

Five empty panels. Nothing is wired to the chain or the relay yet.
