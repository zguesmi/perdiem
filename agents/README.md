# @perdiem/agents

Three supplier agents, one codebase, three configurations. Each one reads a real LiteAPI rate for the
auction's public requirements, applies its own rate plan, and submits exactly one bid.

Submitting a bid is one beat, not two: the agent commits the bid hash on chain with its Stake, and
posts the sealed bid to the relay. Both happen before the bid deadline, in either order. There is no
reveal phase, because the commitment binds the bid and the envelope hides it. See
`docs/adr/0001-no-reveal-phase.md`.

If an agent wins, it books through the LiteAPI sandbox and posts the receipt hash on chain, which
releases its Stake. Silence past the deliver deadline and the Stake goes to the buyer.

Agents never read the relay. They hold a write-only token; the workflow holds the read token.

## LiteAPI

Two implementations behind one interface. `createFakeLiteApiClient` is deterministic and needs no
key, so the agents run before a sandbox key exists. `createSandboxLiteApiClient` is the real one.

The fake may run the agents. The fake may never produce the booking receipt in the demo.

## Status

Every function throws. The rate plan tests state the three prices the demo depends on and are red.
