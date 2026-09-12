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

Full account, phase by phase: [`docs/README.md`](docs/README.md).

## Setup

Requires Node 22 or later and pnpm 12.3.4 (`corepack enable` picks up the pinned version).

```sh
pnpm install                  # the workspace: onchain, purchaser, relay, supplier, ui
pnpm --dir workflow-cre install   # workflow-cre/ is outside the workspace and installs on its own
cp .env.localhost.example .env.localhost
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

| Command                                | What it starts        | Port                   |
| -------------------------------------- | --------------------- | ---------------------- |
| `pnpm --filter @perdiem/relay dev`     | the sealed-bid relay  | 8787, `RELAY_PORT`     |
| `pnpm --filter @perdiem/purchaser dev` | the purchaser service | 8788, `PURCHASER_PORT` |
| `pnpm --filter @perdiem/ui dev`        | the demo page         | 5173                   |

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

Not in it: the CRE workflow, which needs the `cre` binary, and the buyer. Open an auction against
the running stack from the repository root:

```sh
set -a; source .env.localhost; set +a
npx tsx scripts/sealed-bidding.ts
```

## The enclave key

An X25519 keypair. The public half is a `SealedAuction` constructor argument, readable as
`enclavePublicKey()`. The private half is the workflow secret `ENCLAVE_PRIVATE_KEY`, loaded only
inside `handlerInTee`.

- `onchain/scripts/deploy.ts` generates it on the first run, when `ENCLAVE_PRIVATE_KEY` is empty,
  and writes the private half into the environment file as base64.
- A new key means a new contract, and every ciphertext already at the relay stops opening.
- Its holder can read every sealed bid, so every price and every preference, and every supplier's
  booking credentials.
- Here the holder is whoever runs the deployment. `.env.localhost` is bind-mounted into every
  container, so the purchaser service and the three agents can read it as well.
- The buyer and the suppliers should not hold it. A party that is neither generates the keypair and
  uploads the private half, and only the public half reaches the contract.
- What would remove the trusted party: a private half that only ever exists inside an attested
  enclave. Out of scope here, because the enclave has no randomness of its own —
  `x25519.utils.randomPrivateKey()` throws `crypto.getRandomValues must be defined` there.

## The sealed bidding slice

One script runs the first half of the flow on a local node and stops at the last sealed bid:

```sh
./scripts/demo-sealed-bidding.sh
```

It starts a Hardhat node, deploys, starts the relay, starts the three agents, opens an auction
against `referencePolicy`, and waits for three commitments on chain and three ciphertexts at the
relay. It needs `ANTHROPIC_API_KEY` and the booking credentials in `.env.localhost`, because the
agents price with a model. Scoring, settlement and the booking are not in it.

The test suites are red on purpose. They state the behaviour each package owes before it is written;
every package README says what its own red tests are waiting on.
