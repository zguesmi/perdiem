# @perdiem/ui

One page for one auction, read top to bottom.

- Two figures first: the travel desk's own USDC, and the largest stay the spend policy will sign.
- **The request card** takes the buyer's sentence. `POST /intent` answers with a summary, and
  confirming it calls `POST /confirm`, which hashes the policy, seals it to the relay and funds the
  auction.
- **The stepper**: Created, Bidding, Settling, Finalized, Timeout. Timeout is always on screen,
  dashed and muted until it happens. A reached step is a button; the rest are disabled.
- **One detail card**, for the selected step only. It carries a sentence in the tense the step is
  in, the mechanism behind an `i`, and the rows that step owns: hashes, amounts, commitments, the
  booking and the transactions, linked to `VITE_EXPLORER_URL` when one is configured.
- **Enclave and balances**, folded away: the enclave public key, the policy hash, the bids root, and
  the USDC held by the escrow, the buyer and every supplier that committed.

The selection follows the auction whenever it advances, and a click overrides it until the next
advance. A load that finds a finished auction collapses it to one line with a **View** button, so
the reader who arrived late gets the request box rather than someone else's settlement; an auction
that finishes while the page is open stays open.

The page reads the chain and the relay on a 5 second timer and holds no auction state of its own. It
shows the newest auction and nothing else. The countdown ticks on its own second.

It cannot show the private half of the policy, because it never holds it. The maximum price and the
preferences are a workflow secret, and a sealed bid is ciphertext to everyone but the enclave.

## Configuration

This package has no environment file. Vite reads `VITE_`-prefixed variables straight from the
process environment, so the repository root file for the network is the only one, and every service
starts the same way:

```sh
set -a; source .env.localhost; set +a
```

`VITE_SEALED_AUCTION_ADDRESS`, `VITE_RELAY_URL`, `VITE_PURCHASER_URL` and `VITE_MAX_PAYOUT_CAP` are
required. The page names the missing one rather than rendering blank. `VITE_NETWORK_NAME`,
`VITE_EXPLORER_URL` and `VITE_FROM_BLOCK` are optional; an unset network name hides the pill rather
than guessing, and an empty explorer renders hashes as plain text.

`ARC_RPC_URL`, `BOOKING_URL` and `BOOKING_API_KEY` carry no `VITE_` prefix and never reach the
bundle. The server proxies `/rpc` to the node, `/booking/{bookingId}` and `/hotel?hotelId=` to the
booking API with the key attached, and the page reads all three through its own origin.

Only the `VITE_` prefix keeps the seven private keys in that same file out of the bundle. Never name
a secret `VITE_`, and never set `envPrefix` in `vite.config.ts`.

This package keeps the `tsconfig.json`, `vite.config.ts` and lint setup that `pnpm create vite`
generated, rather than extending `tsconfig.base.json`. Same rule as `onchain/`: where a tool owns
its configuration, the generated file is left alone.

## Style

`src/index.css` is the whole palette, the whole type scale and the whole spacing rhythm: three type
sizes, one accent on the live step, one hairline border, and structure from whitespace. Every gap is
a multiple of `--step`, and every colour is defined in both colour schemes. One breakpoint, at
700px, stacks the two figures and wraps the stepper.

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
