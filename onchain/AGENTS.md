# Hardhat + viem project

## Project layout

```
contracts/        Solidity source files (*.sol). Nothing test-only lives here
test/             Solidity unit tests (*.t.sol), their mocks, and TypeScript integration tests
ignition/         Hardhat Ignition deployment modules
scripts/          Standalone scripts run with `hardhat run`
hardhat.config.ts
```

`.claude/rules/solidity.md` at the repository root sets the conventions: layout, OpenZeppelin use,
declaration order, storage, comments and test shape.

## Working in this project

When writing or modifying tests, configuring `hardhat.config.ts`, or interacting with the network
from TypeScript, invoke the **`hardhat`** skill. It covers Solidity and TypeScript testing, how to
choose between them, `forge-std` cheatcodes, the `network.create()` API, `networkHelpers`, and the
compile-then-typecheck workflow. The skill itself points to the matching `hardhat-toolbox-*` skill
for toolbox-specific guidance (clients, contract interaction, assertions).

## Working in this repository

Domain vocabulary is in the root `CONTEXT.md`. Contract naming follows it: Payout Cap, Payout,
Stake, Bid, Bid Commitment, Bids Root, Settlement. Escrow is the custody role this contract plays,
not a separate contract.

`packages/core` owns canonical JSON, the policy hash, and EIP-712 hashing. Do not reimplement any of
them in Solidity without a test that asserts both languages produce the same bytes.

## Docs

- Hardhat 3 — https://hardhat.org/llms.txt
- viem — https://viem.sh/llms.txt
