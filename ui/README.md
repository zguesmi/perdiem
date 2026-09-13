# @perdiem/ui

One page for one auction, read top to bottom.

**New auction** takes the buyer's sentence: `POST /intent` on the purchaser service answers with a
summary, and confirming it calls `POST /confirm`, which hashes the policy, seals it to the relay and
funds the auction.

Then the **stepper**: Created, Bidding, Settling, Finalized, with Timeout replacing the last step on
a timed-out auction. The rule above each step says done, live or pending. Each step carries one line
and the transactions that produced it, in block order, linked to `VITE_EXPLORER_URL` when one is
configured. It stays in view while the panels are read.

Then five panels, each holding what only it can say:

1. **Intent** — the policy hash and the public requirements, from `TermsPublished`.
2. **Funding** — the buyer, and who authorized the spend when this page opened the auction.
3. **Bids** — one row per on-chain commitment, with the size of its ciphertext at the relay.
4. **Enclave** — the bids root, and the booking id the enclave read back.
5. **Balances** — the USDC held by the escrow, the buyer and every supplier that committed.

Every fact appears once. The amounts and the state live on the stepper and in the balances, so no
panel repeats them.

The page reads the chain and the relay on a 2 second timer and holds no auction state of its own. It
shows the newest auction and nothing else. The countdown ticks on its own second.

It cannot show the private half of the policy, because it never holds it. The maximum price and the
preferences are a workflow secret, and a sealed bid is ciphertext to everyone but the enclave.

Desktop only. No mobile layout.

## Configuration

This package has no environment file. Vite reads `VITE_`-prefixed variables straight from the
process environment, so the repository root file for the network is the only one, and every service
starts the same way:

```sh
set -a; source .env.localhost; set +a
```

`VITE_SEALED_AUCTION_ADDRESS`, `VITE_RELAY_URL` and `VITE_PURCHASER_URL` are required. The page
names the missing one rather than rendering blank. `VITE_EXPLORER_URL` and `VITE_FROM_BLOCK` are
optional; leave the explorer empty on a local node and hashes render as plain text.

`ARC_RPC_URL` carries no `VITE_` prefix and never reaches the bundle. The server proxies `/rpc` to
it, and the page reads the chain through that path on its own origin.

Only the `VITE_` prefix keeps the seven private keys in that same file out of the bundle. Never name
a secret `VITE_`, and never set `envPrefix` in `vite.config.ts`.

This package keeps the `tsconfig.json`, `vite.config.ts` and lint setup that `pnpm create vite`
generated, rather than extending `tsconfig.base.json`. Same rule as `onchain/`: where a tool owns
its configuration, the generated file is left alone.

## Style

`src/index.css` is the whole palette, the whole type scale and the whole spacing rhythm: three type
sizes, one accent on the live step, one hairline border, and structure from whitespace. Every colour
is defined in both colour schemes.

## Commands

Run from the repository root, after `pnpm install`.

```sh
pnpm --filter @perdiem/ui dev         # vite dev server on port 5173
pnpm --filter @perdiem/ui build       # tsc -b, then vite build into dist/
pnpm --filter @perdiem/ui preview     # serves the built dist/
pnpm --filter @perdiem/ui typecheck   # tsc -b
pnpm --filter @perdiem/ui lint        # oxlint
pnpm --filter @perdiem/ui test        # node:test, over the step logic
```

## Status

Wired to the chain and the relay. Two things the page does not show, because nothing publishes them
yet: the buyer's sentence and the parsed policy, and the losing bids after settlement.
