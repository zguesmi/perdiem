# Running Perdiem, and how it was built

## Setup

Node 22 or later, and pnpm 12.3.4 (`corepack enable` picks up the pinned version).

```sh
pnpm install                      # the workspace: onchain, purchaser, relay, supplier, ui
pnpm --dir workflow-cre install   # workflow-cre/ is outside the workspace
cp .env.localhost.example .env.localhost
```

## Commands

```sh
pnpm build       # every package that has a build script
pnpm test        # every test suite
pnpm typecheck
pnpm lint
```

`workflow-cre/` is not a workspace member, so the recursive scripts skip it:

```sh
pnpm --dir workflow-cre test
pnpm --dir workflow-cre typecheck
```

One package at a time, and the three services, one terminal each:

```sh
pnpm --filter @perdiem/onchain test
pnpm --filter @perdiem/relay dev       # the sealed-bid relay, 8787
pnpm --filter @perdiem/purchaser dev   # the buyer's service, 8788
pnpm --filter @perdiem/ui dev          # the page, 5173
```

## The whole stack in containers

```sh
cp .env.localhost.example .env.localhost   # fill in ANTHROPIC_API_KEY and the booking credentials
docker compose up --build
```

Eight containers: a node with the contracts on it, a one-shot deployment, the relay, the purchaser
service, the three supplier agents and the page. Published on 8545, 8787, 8788 and 5173.

`.env.localhost` is bind-mounted into every container, and the deployment writes the contract
addresses into it. Everything downstream waits for that container to exit, so no service starts
against an address that does not exist yet.

The CRE workflow is not in it, because it needs the `cre` binary, and neither is the buyer. Open an
auction against the running stack:

```sh
set -a; source .env.localhost; set +a
npx tsx scripts/sealed-bidding.ts
```

## The sealed-bidding slice

One script runs the first half of the flow on a local node and stops at the last sealed bid:

```sh
./scripts/demo-sealed-bidding.sh
```

It starts a Hardhat node, deploys, starts the relay, starts the three agents, opens an auction
against `referencePolicy`, and waits for three commitments on chain and three ciphertexts at the
relay. It needs `ANTHROPIC_API_KEY` and the booking credentials in `.env.localhost`, because the
agents price with a model. Scoring, settlement and the booking are not in it.

## How AI built it

Every phase used AI. This is the account of which tool, and what came out of it.

- **claude.ai** — the idea, the research and the verification, before the repository existed.
- **Claude Code**, model Claude Opus 5 (`claude-opus-5`) — every phase after that.
- **`mattpocock-skills`, version 1.2.3** — the `/grill-with-docs` command, which runs the `grilling`
  and `domain-modeling` skills.

### Phase 1 — Idea and research

Brainstormed on claude.ai, then checked: what the partner technologies do, what the market already
does, and what the idea has to be worth to be worth building. Frozen as
[`initial-spec.md`](initial-spec.md).

### Phase 2 — Spec hardening

Ten rounds of `/grill-with-docs`. Claude asked 41 questions, each with a recommended answer; the
developer raised 10 challenges of their own. It settled the repository layout, the toolchain, the
test strategy, the secrets layout and the domain vocabulary, and it found two defects in the initial
spec: the budget leaked the maximum price on chain, and seven components used two words for one
concept. The transcript is [`grilling-session.md`](grilling-session.md).

### Phase 3 — Live spec

Those corrections applied to one live document, [`spec.md`](spec.md), with the frozen original
beside it.

### Phase 4 — Scaffolding

Every package built with its own official init command where one exists: `hardhat --init`,
`pnpm create vite`, `pnpm create hono`. Each one carried its first test, taken from the
specification and red on purpose, and the tickets in `scratch/build/` made them pass.

### Phase 5 onwards

The build itself, ticket by ticket. This file is updated as each phase completes.
