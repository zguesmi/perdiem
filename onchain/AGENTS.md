# Hardhat + viem project

## Project layout

```
contracts/        Solidity source files (*.sol) and unit tests (*.t.sol)
test/             TypeScript integration tests and Solidity unit tests (*.sol)
ignition/         Hardhat Ignition deployment modules
scripts/          Standalone scripts run with `hardhat run`
hardhat.config.ts
```

## Working in this project

When writing or modifying tests, configuring `hardhat.config.ts`, or interacting with the network from TypeScript, invoke the **`hardhat`** skill. It covers Solidity and TypeScript testing, how to choose between them, `forge-std` cheatcodes, the `network.create()` API, `networkHelpers`, and the compile-then-typecheck workflow. The skill itself points to the matching `hardhat-toolbox-*` skill for toolbox-specific guidance (clients, contract interaction, assertions).

## Working in this repository

Domain vocabulary lives in the root `CONTEXT.md`. Contract naming follows it: Budget, Payout, Stake,
Bid, Bid Commitment, Bids Root, Settlement. Escrow is the custody role this contract plays, not a
separate contract.

`packages/core` owns canonical JSON, the policy hash, and EIP-712 hashing. Do not reimplement any of
them in Solidity without a test that asserts both languages produce the same bytes.

## Docs

- Hardhat 3 — https://hardhat.org/llms.txt
- viem — https://viem.sh/llms.txt
