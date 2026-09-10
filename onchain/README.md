# Onchain

The `SealedAuction` contract and its tests. Hardhat 3, the Node.js test runner (`node:test`), and
`viem` for Ethereum calls.

Hardhat 3 reference: the
[Getting Started guide](https://hardhat.org/docs/getting-started#getting-started-with-hardhat-3).

## Commands

Run from the repository root, after `pnpm install`.

```sh
pnpm --filter @perdiem/onchain build       # hardhat compile
pnpm --filter @perdiem/onchain test        # every test, Solidity and TypeScript
pnpm --filter @perdiem/onchain typecheck   # hardhat compile, then tsc --noEmit
```

Inside `onchain/`, Hardhat's own commands work directly, and let you pick one kind of test:

```sh
npx hardhat compile
npx hardhat test
npx hardhat test solidity   # contracts/*.t.sol
npx hardhat test nodejs     # test/*.ts
```

## What is here

- One Hardhat configuration file.
- Foundry-compatible Solidity unit tests.
- TypeScript integration tests that use [`node:test`](https://nodejs.org/api/test.html) and
  [`viem`](https://viem.sh/).
- Template examples that connect to several network types, including a local simulation of OP
  mainnet.

## Usage

### Running tests

Run every test:

```shell
npx hardhat test
```

Run one kind of test:

```shell
npx hardhat test solidity
npx hardhat test nodejs
```

### Deploy to Sepolia

Template leftover. `ignition/modules/` is empty and this repository targets Arc testnet, so the
commands below do not work yet.

Deploy to a local chain:

```shell
npx hardhat ignition deploy ignition/modules/Counter.ts
```

A Sepolia deployment needs a funded account. The Hardhat configuration reads a configuration
variable named `SEPOLIA_PRIVATE_KEY`. Set it with the `hardhat-keystore` plugin or as an environment
variable.

Set it with `hardhat-keystore`:

```shell
npx hardhat keystore set SEPOLIA_PRIVATE_KEY
```

Then deploy to Sepolia:

```shell
npx hardhat ignition deploy --network sepolia ignition/modules/Counter.ts
```
