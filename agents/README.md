# @perdiem/agents

Three supplier agents, one codebase, three configurations and three prompts. Each one is a Claude
tool-calling loop: an operator starts it with one sentence of business rules, the model reads the
auction terms off the chain, applies the rules, and submits exactly one bid.

The model derives three things from the auction rather than the prompt: the number of nights, the
season, and a hotel at its own star level. That is what the model is for. See
`docs/adr/0007-supplier-agents-decide-with-a-model.md`.

## The two tools

`getHotelId` returns real hotel identifiers, names and star levels. Any valid identifier is
acceptable: the enclave books against it, so it has to exist, and nothing else about it is scored.

`submitBid` does everything else in Node, in one call: validate the fields, check the price band,
hash the bid, sign it, draw a salt, compute the commitment, seal the envelope, approve and commit
the stake on chain, and post the ciphertext to the relay. Those steps have one legal order, so they
are one tool. Split apart, a model can seal without committing, commit without posting, or commit
twice.

The model never sees a hash, a salt, a signature or a private key. A model that wrote its own
hashing would produce a commitment the enclave drops, and that drop is silent.

An agent never books. It seals its own booking credentials into the envelope and the enclave books
with them, so the agent has nothing to do after the bid deadline.

## The price band

Each configuration carries a `priceBand` in USDC minor units, and `submitBid` refuses a price
outside it and names the band in the error. The model corrects on the next turn. The band is
configuration, not a hidden rule.

Each band covers the rate its prompt gives for a one or two night stay outside winter, which is the
only auction the demo runs. A three night or winter auction prices below the band, and `submitBid`
refuses it. The cost of that: the bands are a guard on one auction, not a full rate card.

## Wallets

Each agent signs with one signer behind a three-member interface: the address, an EIP-712 signature
over the `Bid` type, and a contract write. `createLocalSigner` is a viem externally owned account.
The bid signature and the chain calls come from the same address, because `commit` pulls the stake
from the caller and the enclave checks that the bid's signer staked.

## Commands

Run from the repository root, after `pnpm install`.

```sh
pnpm --filter @perdiem/agents test        # tsx --test over test/**/*.test.ts
pnpm --filter @perdiem/agents typecheck   # tsc --noEmit
pnpm --filter @perdiem/agents build       # emits dist/
pnpm --filter @perdiem/agents start a     # one agent, from config/a.json and prompts/a.txt
```

The tool tests need no API key. The three end-to-end tests that assert the demo prices skip without
`ANTHROPIC_API_KEY` and `LITEAPI_SANDBOX_KEY`.
