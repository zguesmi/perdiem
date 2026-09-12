# @perdiem/purchaser

The purchaser is the buying side of the auction, the counterpart of `supplier/`. It takes one
English sentence from the buyer and ends with a funded auction on chain.

1. `POST /intent` — one model call with the system prompt at `prompts/intent.md`. It answers with
   the Policy and a plain-English summary of it. One retry, then it gives up.
2. `POST /confirm` — canonicalize the Policy, hash it, lock the payout cap in escrow and open the
   auction. It answers with the policy hash, the public half of the Policy, the auction identifier
   and both transaction hashes.

The buyer approves the summary; the Policy is what gets hashed. The summary is shown and then
dropped, so nothing the model wrote in prose can change what reaches the chain.

The prompt does the conversion the buyer never should: "20 a night" and "12% more" become flat USDC
minor units for this trip, so the buyer confirms concrete numbers and no formula reaches the Policy.
Dates come from the sentence alone. The model is told no date and guesses no year: a sentence with
no year gets no Policy, because a wrong year would be hashed onto a public ledger.

Its environment lives in the repository root, in the `.env.<network>` file the rest of the demo
reads. Intent parsing runs on `claude-opus-5`. Set `INTENT_MODEL` to move it. This is the model that
reads a buyer's sentence at runtime, which is a different fact from the model used to build the
project.

The model client is injected into `createPurchaserApp`, so every test drives the service with a
canned answer and no network. Nothing in `pnpm test` calls a model or costs money.

## Funding

Funding goes through a Privy organization wallet, and it is two signed transactions rather than one:
`createAuction` pulls the payout cap with `transferFrom`, so an `approve` on the USDC token has to
be mined first.

Privy signs and does not broadcast on Arc — `eth_sendTransaction` answers
`App is not authorized to transact on chain eip155:5042002` — so the service takes the signed RLP
from `eth_signTransaction` and sends it to `ARC_RPC_URL` itself.

The payout cap alone decides who authorizes the signature. Above `PRIVY_QUORUM_CEILING` the key
quorum approves and every key in `PRIVY_QUORUM_KEYS` signs the request, comma-separated in one
`privy-authorization-signature` header. At or below it, `PRIVY_SERVER_KEYS` signs, and an empty list
means the wallet's spend policy is the whole authorization.

The spend policy carries two `ALLOW` rules, and both read the calldata rather than the destination
address: a rule on the destination alone would allow any call to the USDC token, an `approve` to a
different spender included. `pnpm privy:policy create` builds them from the deployed addresses and
the contract's own ABI and prints a policy id to attach to the wallet; `pnpm privy:policy probe`
then asks the wallet to approve a spender the policy does not name, and prints the refusal.

The payout cap is derived, not configured: it is the Policy's maximum price rounded up to the next
whole `PAYOUT_CAP_BUCKET`. Strictly up, so a maximum price landing on a boundary is padded to the
next bucket — the cap is emitted in `TermsPublished`, and a cap equal to the maximum price publishes
the ceiling the Policy exists to keep private. The bucket is what the cap leaks: which band the
price falls in, and nothing sharper. A cap derived by adding a fixed pad would leak the price
exactly.

`MAX_PAYOUT_CAP` is the largest cap the spend policy will sign, so a buyer who asks for more than
the organization funds is refused by Privy rather than by this service. Both rules carry the cap,
because the approval is the first of the two transactions and a cap only on `createAuction` would
let it mine before the refusal. `POST /confirm` answers `422` with Privy's own message and the cap
it tried, so the buyer lowers the price and confirms again.

What this service is not: it does not score bids, does not book anything, and holds no bids. It
writes one thing to the relay, the sealed policy, and reads nothing back.

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

The ceiling is a per-signer override policy on one wallet, not a quorum threshold. That path is
documented by Privy and has not been run: what is verified is a policy-only wallet signing with no
authorization header, and a 2-of-2 quorum wallet refusing anything but two signatures. Pointing
`PRIVY_WALLET_ID` at a quorum-owned wallet and leaving `PRIVY_SERVER_KEYS` empty exercises only the
quorum half.
