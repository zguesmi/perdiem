# Perdiem

> *Per diem (Latin for "per day") is a fixed daily allowance paid by an employer to cover
> work-related expenses, such as meals, lodging, and incidentals, during business travel or
> temporary assignments

Corporate hotel booking where the buyer's selection rules stay private and sealed bids guarantee the
best deal.

## AI tool attribution

Built with [Claude Code](https://claude.com/claude-code), model Claude Opus 5 (`claude-opus-5`),
with the `mattpocock-skills` plugin for the spec-hardening session. Idea development and research
were done on claude.ai.

Full account, phase by phase: [`docs/ai/README.md`](docs/ai/README.md).

## Setup

Requires Node 22 or later and pnpm 12.3.4 (`corepack enable` picks up the pinned version).

```sh
pnpm install                  # the workspace: packages/*, onchain, requisition, relay, supplier, ui
pnpm --dir workflow-cre install   # workflow-cre/ is outside the workspace and installs on its own
cp .env.example .env
```

## Commands

From the repository root, across every workspace package:

```sh
pnpm build       # compile every package that has a build script
pnpm test        # run every test suite
pnpm typecheck   # type-check every package
pnpm lint        # lint every package that has a lint script
```

`workflow-cre/` is not a workspace member, so the recursive scripts skip it. Run it directly:

```sh
pnpm --dir workflow-cre test
pnpm --dir workflow-cre typecheck
```

One package at a time:

```sh
pnpm --filter @perdiem/onchain test
pnpm --filter @perdiem/relay dev
```

Run the services for the demo, one terminal each:

| Command                                  | What it starts          | Port                     |
| ---------------------------------------- | ----------------------- | ------------------------ |
| `pnpm --filter @perdiem/relay dev`       | the sealed-bid relay    | 8787, `RELAY_PORT`       |
| `pnpm --filter @perdiem/requisition dev` | the requisition service | 8788, `REQUISITION_PORT` |
| `pnpm --filter @perdiem/ui dev`          | the demo page           | 5173                     |

## The sealed bidding slice

One script runs the first half of the flow on a local node and stops at the last sealed bid:

```sh
./scripts/demo-sealed-bidding.sh
```

It starts a Hardhat node, deploys, starts the relay, starts the three agents, opens an auction
against `referencePolicy`, and waits for three commitments on chain and three ciphertexts at the
relay. It needs `ANTHROPIC_API_KEY` and the booking credentials in `.env`, because the agents price
with a model. Scoring, settlement and the booking are not in it.

The test suites are red on purpose. They state the behaviour each package owes before it is written;
every package README says what its own red tests are waiting on.
