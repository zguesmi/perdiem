# Verified facts

Things with a single right answer, checked rather than assumed. Trade-offs is in `docs/adr/`
instead, and the reasoning behind the project's shape is in `docs/grilling-session.md`.

Each open row has a ticket in `docs/scratch/verification/`. Nothing downstream of an open row gets
written until the row is closed.

## How to write a row

One line for the fact, then a sub-bullet linking the ticket and a sub-bullet linking the evidence
file. Nothing else. The commands, the requests, the responses and the reasoning live in the ticket
and the evidence file, and are never repeated here. Rows are sorted by ticket number.

## Toolchain

- `hardhat --init` runs without a terminal, with `--template`. Bare `--init` fails with `HHE11`, an
  unknown template with `HHE25`. Ran it.
- The Hardhat templates are `node-test-runner-viem`, `mocha-ethers` and `minimal`. From the `HHE25`
  error output.
- Hardhat 3 does not use TypeChain. The viem toolbox emits types into `artifacts/`. Inspected the
  generated project.
- The template pins solc 0.8.34, evm target `osaka`. From the generated `hardhat.config.ts`.
- This Node cannot run TypeScript directly. `node --experimental-strip-types` fails with
  `ERR_NO_TYPESCRIPT`; `tsx` runs the same `node:test` API. Ran both.
- pnpm 12 allows install scripts through `allowBuilds:` in `pnpm-workspace.yaml`, not
  `onlyBuiltDependencies`. pnpm wrote the key itself.
- `pnpm install` inside `workflow/` installs the root workspace unless `workflow/` has its own
  `pnpm-workspace.yaml`. Ran it.

## Arc testnet

- V5 — USDC is native and pays gas, with an ERC-20 interface at
  `0x3600000000000000000000000000000000000000`, 6 decimals. Gas is quoted in 18-decimal units and
  never enters a Policy, Bid or Settlement.
  - Ticket:
    [05 — Arc USDC address and decimals](scratch/verification/issues/05-arc-usdc-address-and-decimals.md)
- V11 — Hardhat `chainType` is `l1`.
  - Ticket: [11 — Arc Hardhat chainType](scratch/verification/issues/11-arc-hardhat-chaintype.md)
- V12 — chain id 5042002, RPC `https://rpc.testnet.arc.io`, WS `wss://rpc.testnet.arc.io`, explorer
  `https://testnet.arcscan.app`.
  - Ticket:
    [12 — Arc chain id and RPC endpoint](scratch/verification/issues/12-arc-chain-id-and-rpc-endpoint.md)
- Fees: EIP-1559 plus EWMA, target ~$0.01/tx, floor 20 Gwei, ceiling 20,000 Gwei. 0.5 s blocks, 30M
  gas per block. Osaka baseline plus EIP-7708.

## Privy

- V6 — server wallets sign on chain id 5042002 with `eth_signTransaction`, and a policy rule pins
  the chain id. `eth_sendTransaction` refuses Arc, so Privy signs and the requisition service
  broadcasts to `ARC_RPC_URL`. A 2-of-2 key quorum enforces on the app in use, so there is no
  policy-only fallback.
  - Ticket:
    [06 — Privy server wallets on Arc](scratch/verification/issues/06-privy-server-wallets-on-arc.md)
  - Evidence: [06 — Privy server wallets on Arc testnet](evidence/06-privy-server-wallets-on-arc.md)

## Chainlink CRE

- V10 — the Confidential Workflows private beta gates deployment, not simulation.
  `cre workflow simulate` ran the confidential template on an account with no deploy access, and the
  secret resolved inside `handlerInTee`. The simulator is not a real TEE and attests nothing.
  - Ticket:
    [10 — Confidential Workflows beta access](scratch/verification/issues/10-confidential-workflows-beta-access.md)
  - Evidence:
    [10 — Confidential Workflows without beta approval](evidence/10-confidential-workflows-beta-access.md)

## Open

- V1 — does `cre workflow simulate` broadcast a real write to Arc testnet, and with which forwarder
  address?
  - Ticket:
    [01 — CRE simulate writes to Arc](scratch/verification/issues/01-cre-simulate-writes-to-arc.md)
- V2 — can the confidential handler read the chain and call confidential HTTP in simulation?
  - Ticket:
    [02 — Enclave chain read and confidential HTTP](scratch/verification/issues/02-enclave-chain-read-and-confidential-http.md)
- V3 — can the confidential handler load an X25519 private key from secrets and decrypt in-enclave?
  - Ticket:
    [03 — Enclave decrypts sealed bids](scratch/verification/issues/03-enclave-decrypts-sealed-bids.md)
- V4 — how are workflow secrets supplied in simulation, and what is the size limit?
  - Ticket:
    [04 — Workflow secrets in simulation](scratch/verification/issues/04-workflow-secrets-in-simulation.md)
- V7 — can a Circle Agent Stack wallet be created on Arc testnet, and can it sign a contract call
  and an EIP-712 bid? Priority.
  - Ticket:
    [07 — Circle Agent Stack wallets](scratch/verification/issues/07-circle-agent-stack-wallets.md)
- V8 — can one workflow run issue two writes to the same contract?
  - Ticket:
    [08 — Two writes per workflow run](scratch/verification/issues/08-two-writes-per-workflow-run.md)
- V9 — do LiteAPI prebook and book return a stable booking id, and what is the sandbox payment
  method called?
  - Ticket:
    [09 — LiteAPI booking id and payment method](scratch/verification/issues/09-liteapi-booking-id-and-payment-method.md)
- V13 — can the confidential handler reach a relay running on the developer's machine?
  - Ticket:
    [13 — Can the enclave reach the relay](scratch/verification/issues/13-can-the-enclave-reach-the-relay.md)
