# Verified facts

Things with a single right answer, checked rather than assumed. Trade-offs is in `docs/adr/`
instead, and the reasoning behind the project's shape is in `docs/grilling-session.md`.

Each open row has a ticket in `docs/scratch/verification/`. Nothing downstream of an open row gets
written until the row is closed.

## Toolchain

- T1 — `hardhat --init` runs without a terminal, with `--template`. Bare `--init` fails with
  `HHE11`, an unknown template with `HHE25`. Ran it.
- T2 — the Hardhat templates are `node-test-runner-viem`, `mocha-ethers` and `minimal`. From the
  `HHE25` error output.
- T3 — Hardhat 3 does not use TypeChain. The viem toolbox emits types into `artifacts/`, and the
  `/types` line in the generated ignore file is vestigial. Inspected the generated project.
- T4 — the template pins solc 0.8.34 in the default and production profiles, evm target `osaka`.
  From the generated `hardhat.config.ts`.
- T5 — this Node cannot run TypeScript directly. `node --experimental-strip-types` fails with
  `ERR_NO_TYPESCRIPT`, and `tsx` runs the same `node:test` API. Ran both.
- T6 — pnpm 12 allows install scripts through `allowBuilds:` in `pnpm-workspace.yaml`, not
  `onlyBuiltDependencies`. pnpm wrote the key itself.
- T7 — `pnpm install` inside `workflow/` does not install that package. It walks up and installs the
  root workspace unless `workflow/` has its own `pnpm-workspace.yaml`. Ran it.

## Arc testnet

- Chain type: l1
- RPC `https://rpc.testnet.arc.io`
- WS `wss://rpc.testnet.arc.io`
- USDC native, pays gas. Optional ERC-20 interface, 6 decimals,
  `0x3600000000000000000000000000000000000000`. No wrapped USDC.
- Gas unit USDC 18 decimals. Gas accounting only, never a Policy, Bid or Settlement number.
- EIP-1559 + EWMA. Target ~$0.01/tx. Floor 20 Gwei testnet, ceiling 20,000 Gwei. 0.5 s blocks, 30M
  gas/block.
- Osaka hard fork baseline, plus EIP-7708 from Amsterdam.
- explorer base URL `https://testnet.arcscan.app`.

## Open

- V1 — does `cre workflow simulate` broadcast a real write to Arc testnet, and with which forwarder
  address? Open. `docs/scratch/verification/01`.
- V2 — can the confidential handler read the chain and call confidential HTTP in simulation? Open.
  `docs/scratch/verification/02`.
- V3 — can the confidential handler load an X25519 private key from secrets and decrypt in-enclave?
  Open. `docs/scratch/verification/03`.
- V4 — how are workflow secrets supplied in simulation, and what is the size limit? Open.
  `docs/scratch/verification/04`.
- V5 — the USDC address and decimals are in `Arc testnet` above. A funded buyer and three funded
  suppliers are still open. `docs/scratch/verification/05`.
- V6 — do Privy server wallets sign on chain id 5042002? Do policies accept a custom chain id? Are
  key quorums on the free tier? Open. `docs/scratch/verification/06`.
- V7 — can a Circle Agent Stack wallet be created on Arc testnet, and can it sign a contract call
  and an EIP-712 bid? Open, priority. `docs/scratch/verification/07`.
- V8 — can one workflow run issue two writes to the same contract? Open.
  `docs/scratch/verification/08`.
- V9 — do LiteAPI prebook and book return a stable booking id, and what is the sandbox payment
  method called? Open. `docs/scratch/verification/09`.
- V10 — Chainlink Confidential Workflows beta. Request sent 2026-09-08, no response yet.
  `docs/scratch/verification/10`.
- V13 — can the confidential handler reach a relay running on the developer's machine? Open.
  `docs/scratch/verification/13`.
