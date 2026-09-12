# @perdiem/ui

One page, five panels, read top to bottom during the demo:

1. **Intent** — the policy hash and the public requirements, from `TermsPublished`.
2. **Funding** — buyer, payout cap, both deadlines, the `createAuction` transaction.
3. **Bids** — one row per on-chain commitment, with the size of its ciphertext at the relay.
4. **Enclave** — state, bids root, and the claim transaction.
5. **Settlement** — winner, payout, refund, booking id, and the settling transaction.

Every panel ends in a transaction hash, linked to `VITE_EXPLORER_URL` when one is configured.

The page reads `auctions` and `commitments` on a 2 second timer and holds no auction state of its
own. It shows the newest auction and nothing else.

It cannot show the private half of the policy, because it never holds it. The maximum price and the
preferences are a workflow secret, and a sealed bid is ciphertext to everyone but the enclave.

No design work beyond a clean default. No mobile layout.

## Configuration

This package has no environment file. Vite reads `VITE_`-prefixed variables straight from the
process environment, so the repository root `.env` is the only one, and every service starts the
same way:

```sh
set -a; source .env; set +a
```

`VITE_ARC_RPC_URL`, `VITE_SEALED_AUCTION_ADDRESS` and `VITE_RELAY_URL` are required. The page names
the missing one rather than rendering blank. `VITE_EXPLORER_URL` and `VITE_FROM_BLOCK` are optional;
leave the explorer empty on a local node and hashes render as plain text.

Only the `VITE_` prefix keeps the seven private keys in that same `.env` out of the bundle. Never
name a secret `VITE_`, and never set `envPrefix` in `vite.config.ts`.

This package keeps the `tsconfig.json`, `vite.config.ts` and lint setup that `pnpm create vite`
generated, rather than extending `tsconfig.base.json`. Same rule as `onchain/`: where a tool owns
its configuration, the generated file is left alone.

## Commands

Run from the repository root, after `pnpm install`.

```sh
pnpm --filter @perdiem/ui dev         # vite dev server on port 5173
pnpm --filter @perdiem/ui build       # tsc -b, then vite build into dist/
pnpm --filter @perdiem/ui preview     # serves the built dist/
pnpm --filter @perdiem/ui typecheck   # tsc -b
pnpm --filter @perdiem/ui lint        # oxlint
```

This package has no test script.

## Status

Wired to the chain and the relay. Two things the panels do not show, because nothing publishes them
yet: the buyer's sentence and the parsed policy, and the losing bids after settlement.
