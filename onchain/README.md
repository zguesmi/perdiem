# Onchain

The `SealedAuction` contract, its tests and its local deployment. Hardhat 3, Hardhat Ignition and
`viem`.

Hardhat 3 reference: the
[Getting Started guide](https://hardhat.org/docs/getting-started#getting-started-with-hardhat-3).

## Commands

Run from the repository root, after `pnpm install`.

```sh
pnpm --filter @perdiem/onchain build       # hardhat compile
pnpm --filter @perdiem/onchain test        # the Solidity tests
pnpm --filter @perdiem/onchain typecheck   # hardhat compile, then tsc --noEmit
```

Inside `onchain/`, Hardhat's own commands work directly:

```sh
npx hardhat compile
npx hardhat test
```

## What is here

- `contracts/SealedAuction.sol` — escrow, the auction state machine and the settlement receiver.
- `contracts/mocks/MockUSDC.sol` — a six-decimal ERC-20 standing in for Arc's USDC. Local only.
- `test/SealedAuction.t.sol` — Foundry-compatible Solidity unit tests.
- `ignition/modules/Local.ts` — the local deployment, described for Hardhat Ignition.
- `scripts/deploy.ts` — runs that module against a local node and writes the addresses to
  `.env.localhost`.

## Deploying to a local node

Two terminals. The first runs the node, the second deploys to it.

```sh
pnpm --filter @perdiem/onchain node
pnpm --filter @perdiem/onchain deploy:local
```

The script deploys `MockUSDC` and `SealedAuction`, mints 10,000 USDC and sends 10 ETH of gas to the
buyer and the three suppliers, then writes `SEALED_AUCTION_ADDRESS` and `USDC_ADDRESS` into the
repository's `.env.localhost`. Every other package reads them from there.

The file is named after the Hardhat network: `--network localhost` reads and writes
`.env.localhost`, `--network arcTestnet` reads and writes `.env.arcTestnet`. A local deployment
cannot overwrite a testnet one.

The enclave keypair is generated on the first run. The private half is written to `.env.localhost`
as `ENCLAVE_PRIVATE_KEY`, base64, which is the form the workflow secret takes; the public half is a
constructor argument and is readable afterwards as `SealedAuction.enclavePublicKey()`. Later runs
reuse the stored key, because a new key would mean a new contract and every sealed bid already at
the relay would stop opening.

Running the script twice is safe. Ignition records the deployment under `ignition/deployments/` and
deploys nothing it already has. Restarting the node empties the chain, and the script drops that
record when it finds no code at any address in it.

The forwarder is fixed to the address the Chainlink CRE simulator reports from. `SealedAuction`
accepts a settlement from that address alone.

### Arc testnet

Not wired up. `hardhat.config.ts` has the network and reads `DEPLOYER_PRIVATE_KEY`, and Arc has a
real USDC, so a deployment there takes a different module from the local one.
