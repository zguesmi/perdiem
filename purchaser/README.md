# @perdiem/purchaser

The purchaser is the buying side of the auction, the counterpart of `supplier/`. It takes one
English sentence from the buyer and ends with a funded auction on chain.

1. `POST /intent` — one LLM call with a fixed system prompt, validated against the Policy schema.
   One retry, then it gives up.
2. `POST /confirm` — canonicalize the Policy, hash it, upload the Policy and the enclave private key
   as workflow secrets, and call `createAuction` with the Budget.

Funding goes through a Privy organization wallet. Its spend policy allows USDC transfers to the
`SealedAuction` contract and nothing else, and anything above the ceiling needs a key quorum: the
travel manager and finance both sign.

What this service is not: it does not score bids, does not book anything, holds no bids, and never
reads the relay.

## Commands

Run from the repository root, after `pnpm install`.

```sh
pnpm --filter @perdiem/purchaser dev         # tsx watch, reloads on change
pnpm --filter @perdiem/purchaser test        # tsx --test over test/**/*.test.ts
pnpm --filter @perdiem/purchaser typecheck   # tsc --noEmit
pnpm --filter @perdiem/purchaser build       # emits dist/
pnpm --filter @perdiem/purchaser start       # runs dist/index.js, needs build first
```

The server listens on port 8788. Set `PURCHASER_PORT` to move it.

## Status

Both routes answer `501`. The tests are red, and the Policy shape they assume is blocked on
`docs/scratch/build/issues/01-policy-schema-and-scoring-formula.md`.
