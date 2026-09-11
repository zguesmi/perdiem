# @perdiem/relay

Stores one sealed bid per supplier, per auction, and serves the set to the enclave. It cannot read
what it holds: the bid, its salt and its signature are sealed to the enclave's public key inside the
supplier agent, so a relay leak reveals ciphertext and nothing else.

There is no authentication. A supplier can fetch a rival's ciphertext and count the bids; it learns
no price, because only the enclave holds the private key. Dropping a blob is still possible, and
that is what the bids root on chain catches.

The store is an in-memory map, keyed by auction and supplier. First write wins.

## Commands

Run from the repository root, after `pnpm install`.

```sh
pnpm --filter @perdiem/relay dev         # tsx watch, reloads on change
pnpm --filter @perdiem/relay test        # tsx --test over test/**/*.test.ts
pnpm --filter @perdiem/relay typecheck   # tsc --noEmit
pnpm --filter @perdiem/relay build       # emits dist/
pnpm --filter @perdiem/relay start       # runs dist/index.js, needs build first
```

The server listens on port 8787. Set `RELAY_PORT` to move it.
