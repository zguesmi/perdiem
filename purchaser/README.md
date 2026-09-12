# @perdiem/purchaser

The purchaser is the buying side of the auction, the counterpart of `supplier/`. It takes one
English sentence from the buyer and ends with a funded auction on chain.

1. `POST /intent` — one model call with the system prompt at `prompts/intent.md`. It answers with
   the Policy and a plain-English summary of it. One retry, then it gives up.
2. `POST /confirm` — canonicalize the Policy and hash it, and return the public half of it.

The buyer approves the summary; the Policy is what gets hashed. The summary is shown and then
dropped, so nothing the model wrote in prose can change what reaches the chain.

The prompt does the conversion the buyer never should: "20 a night" and "12% more" become flat USDC
minor units for this trip, so the buyer confirms concrete numbers and no formula reaches the Policy.
Dates come from the sentence alone. The model is told no date and guesses no year: a sentence with
no year gets no Policy, because a wrong year would be hashed onto a public ledger.

Intent parsing runs on `claude-opus-5`. Set `INTENT_MODEL` to move it. This is the model that reads
a buyer's sentence at runtime, which is a different fact from the model used to build the project.

The model client is injected into `createPurchaserApp`, so every test drives the service with a
canned answer and no network. Nothing in `pnpm test` calls a model or costs money.

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
pnpm --filter @perdiem/purchaser start       # tsx src/index.ts
```

The prompt itself is checked by hand, against the real model. It costs money, so it is a script and
not a test. Run it after any change to `prompts/intent.md` or the Policy schema:

```sh
ANTHROPIC_API_KEY=... pnpm --filter @perdiem/purchaser check:intent
ANTHROPIC_API_KEY=... pnpm --filter @perdiem/purchaser check:intent "two nights in Rome…"
```

The server listens on port 8788. Set `PURCHASER_PORT` to move it.

## Status

Funding is not wired yet: `POST /confirm` hashes the Policy and returns it, and does not upload the
workflow secrets or call `createAuction`.
