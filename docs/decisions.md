# Verified facts

Things with a single right answer, checked rather than assumed. Trade-offs is in `docs/adr/`
instead, and the reasoning behind the project's shape is in `docs/grilling-session.md`.

Each open row has a ticket in `docs/scratch/verification/`. Nothing downstream of an open row gets
written until the row is closed.

## Toolchain

| #   | Question                                                     | Answer                                                                                                          | Source                          | Verified   |
| --- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------- | ---------- |
| T1  | Can `hardhat --init` run without a terminal?                 | Yes, with `--template`. Bare `--init` fails with `HHE11`, an unknown template with `HHE25`                      | Ran it                          | 2026-09-08 |
| T2  | Which Hardhat templates exist?                               | `node-test-runner-viem`, `mocha-ethers`, `minimal`                                                              | `HHE25` error output            | 2026-09-08 |
| T3  | Does Hardhat 3 use TypeChain?                                | No. The viem toolbox emits types into `artifacts/`. The `/types` line in the generated ignore file is vestigial | Inspected the generated project | 2026-09-08 |
| T4  | Which solc version does the template pin?                    | 0.8.34, default and production profiles, evm target `osaka`                                                     | Generated `hardhat.config.ts`   | 2026-09-08 |
| T5  | Can this Node run TypeScript directly?                       | No. `node --experimental-strip-types` fails with `ERR_NO_TYPESCRIPT`. `tsx` runs the same `node:test` API       | Ran both                        | 2026-09-08 |
| T6  | How does pnpm 12 allow install scripts?                      | `allowBuilds:` in `pnpm-workspace.yaml`, not `onlyBuiltDependencies`                                            | pnpm wrote the key itself       | 2026-09-08 |
| T7  | Does `pnpm install` inside `workflow/` install that package? | No. It walks up and installs the root workspace unless `workflow/` has its own `pnpm-workspace.yaml`            | Ran it                          | 2026-09-08 |

## Arc testnet

- USDC native, pays gas. Optional ERC-20 interface, 6 decimals,
  `0x3600000000000000000000000000000000000000`. No wrapped USDC.
- Gas unit USDC 18 decimals. Gas accounting only, never a Policy, Bid or Settlement number.
- EIP-1559 + EWMA. Target ~$0.01/tx. Floor 20 Gwei testnet, ceiling 20,000 Gwei. 0.5 s blocks, 30M
  gas/block.
- Osaka hard fork baseline, plus EIP-7708 from Amsterdam.

## Open

| #   | Question                                                                                                                  | Answer                                                          | Ticket                         |
| --- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------ |
| V1  | Does `cre workflow simulate` broadcast a real write to Arc testnet, and with which forwarder address?                     | open                                                            | `docs/scratch/verification/01` |
| V2  | Can the confidential handler read the chain and call confidential HTTP in simulation?                                     | open                                                            | `docs/scratch/verification/02` |
| V3  | Can the confidential handler load an X25519 private key from secrets and decrypt in-enclave?                              | open                                                            | `docs/scratch/verification/03` |
| V4  | How are workflow secrets supplied in simulation, and what is the size limit?                                              | open                                                            | `docs/scratch/verification/04` |
| V5  | What is the USDC address on Arc testnet, and how many decimals? What are the faucet limits?                               | address and decimals in `Arc testnet` above, faucet limits open | `docs/scratch/verification/05` |
| V6  | Do Privy server wallets sign on chain id 5042002? Do policies accept a custom chain id? Are key quorums on the free tier? | open                                                            | `docs/scratch/verification/06` |
| V7  | Can a Circle Agent Stack wallet be created on Arc testnet, and can it sign a contract call and an EIP-712 bid?            | open, priority                                                  | `docs/scratch/verification/07` |
| V8  | Can one workflow run issue two writes to the same contract?                                                               | open                                                            | `docs/scratch/verification/08` |
| V9  | Do LiteAPI prebook and book return a stable booking id, and what is the sandbox payment method called?                    | open                                                            | `docs/scratch/verification/09` |
| V10 | Chainlink Confidential Workflows beta: request sent, response received?                                                   | request sent 2026-09-08, no response yet                        | `docs/scratch/verification/10` |
| V13 | Can the confidential handler reach a relay running on the developer's machine?                                            | open                                                            | `docs/scratch/verification/13` |

## Evidence

Terminal output and logs behind the answers above is in `docs/evidence/`. A row is not closed until
its evidence is in that directory.

### T5 — this Node cannot strip types

```
$ node --experimental-strip-types --test 'test/**/*.test.ts'
Error [ERR_NO_TYPESCRIPT]: Node.js is not compiled with TypeScript support
```

Consequence: every TypeScript package runs its tests through `tsx`, which loads the same `node:test`
API. `onchain/` is unaffected, because Hardhat loads TypeScript itself.

### T7 — the workflow package installs alone

`pnpm install` run inside `workflow/` reported "Done" and installed the root workspace's packages
instead, leaving `workflow/node_modules` absent. Adding a `pnpm-workspace.yaml` with `packages: []`
to `workflow/` stops the upward search and installs that package alone.
