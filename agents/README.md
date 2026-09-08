# @perdiem/agents

Three supplier agents, one codebase, three configurations. Each one reads a real LiteAPI rate for
the auction's public requirements, applies its own rate plan, and submits exactly one bid.

Submitting a bid is one beat, not two: the agent commits the bid hash on chain with its Stake, and
posts the sealed bid to the relay. Both happen before the bid deadline, in either order. There is no
reveal phase, because the commitment binds the bid and the envelope hides it. See
`docs/adr/0001-no-reveal-phase.md`.

If an agent wins, it books through the LiteAPI sandbox and posts the receipt hash on chain, which
releases its Stake. Silence past the deliver deadline and the Stake goes to the buyer.

The relay has no authentication, so an agent can fetch a rival's ciphertext. It learns no price,
because only the enclave holds the private key.

## Wallets

Each agent signs with a Circle Agent Stack wallet. Two implementations behind one interface:
`createCircleAgentSigner` is the demo path, and `createLocalSigner` is a viem externally owned
account, kept so the bid flow and its tests run before a Circle wallet exists. The bid signature and
the chain calls come from the same address, because `commit` pulls the Stake from the caller and the
enclave checks that the bid signer staked.

## LiteAPI

Two implementations behind one interface. `createFakeLiteApiClient` is deterministic and needs no
key, so the agents run before a sandbox key exists. `createSandboxLiteApiClient` is the real one.

The fake may run the agents. The fake may never produce the booking receipt in the demo.

## Commands

Run from the repository root, after `pnpm install`.

```sh
pnpm --filter @perdiem/agents test        # tsx --test over test/**/*.test.ts
pnpm --filter @perdiem/agents typecheck   # tsc --noEmit
pnpm --filter @perdiem/agents build       # emits dist/
pnpm --filter @perdiem/agents start       # tsx src/index.ts
```

`start` has nothing to run yet: `src/index.ts` is still only the barrel export. The three agent
processes get their entry point when the bid flow is written.

## Status

Every function throws. The rate plan tests state the three prices the demo depends on and are red.
