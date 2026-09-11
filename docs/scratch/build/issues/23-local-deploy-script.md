# Deploy the contracts to a local node

Status: resolved Type: task Blocked by: none (can start immediately)

Nothing outside `onchain/` can run today, because no address exists to call. The contract is only
ever deployed inside a test.

`onchain/scripts/deploy.ts` deploys `MockUSDC` and `SealedAuction` to the Hardhat node, funds the
buyer and the three suppliers, and writes the addresses where the other packages read them.

`SealedAuction` takes three constructor arguments: the USDC address, the forwarder address and
`enclavePublicKey`. The forwarder is the simulation address
`0x6e9ee680ef59ef64aa8c7371279c27e496b5edc1`, per verification row 01. The enclave public key is the
X25519 public half, and this script generates the pair, because ticket 16 ships documentation and no
code.

The private half is a secret the enclave loads. On a local node it goes to `.env`, which is where
the known limitation in ticket 16 already puts it.

Two decisions to make and write down:

- `MockUSDC.sol` lives in `onchain/test/`. Either the deploy script reads its artifact from there,
  or the contract moves. A contract used by a deploy script is not a test fixture.
- The address file format and location. Every other package reads it, so it is an interface.

## Acceptance criteria

- [x] `onchain/scripts/deploy.ts` deploys `MockUSDC` and `SealedAuction` against a Hardhat node.
- [x] It generates the X25519 keypair, passes the public half to the constructor, and writes the
      private half to `.env`.
- [x] It mints USDC to the buyer and to three supplier addresses, enough for the Payout Cap and
      three Stakes.
- [x] It writes the addresses and the enclave public key to one file, in a format the other packages
      import.
- [x] Running it twice gives a clean deployment both times, with no manual cleanup.

## Comments

## Dev review

The deployment is a Hardhat Ignition module, `onchain/ignition/modules/Local.ts`, and
`onchain/scripts/deploy.ts` runs it. Ignition already records what it deployed, so the script does
not track addresses itself.

The two decisions:

- `MockUSDC.sol` moved to `onchain/contracts/mocks/`. A contract a deploy script deploys is not a
  test fixture. `SealedAuction` still must not import it.
- The address file is `.env`. The script writes `SEALED_AUCTION_ADDRESS` and `USDC_ADDRESS` there,
  the same two variables an Arc deployment fills in, so no package needs a second code path for a
  local run. Ignition's own record under `ignition/deployments/hardhat/` is the deployment history
  and nothing outside `onchain/` reads it. That directory is gitignored; records for real chains
  stay tracked.

The deployment id is `hardhat`, not Ignition's default `chain-31337`. The local node's chain id says
nothing the directory name does not.

`connection.ignition.deploy` does not make the stale-record check that the `hardhat ignition deploy`
task makes. Against a restarted node it printed the recorded addresses and deployed nothing:
`eth_getCode` returned `0x` at both. The script drops the record when no address in it has code.

The enclave keypair is generated on the first run and reused after it. The public half is a
constructor argument, so a new key would be a new contract, and every sealed bid already at the
relay would stop opening. The private half goes to `.env` as base64, which is the form the workflow
secret takes.

Every account gets 10,000 USDC and 10 ETH of gas, against a 750 payout cap and a 50 stake, so one
node serves many auctions. The addresses are the four in `.env`, the same set the demo uses on Arc.

No automated test covers the script. It was run by hand three ways: from a clean slate, twice
against one node, and against a restarted node. Each time `usdc()`, `forwarder()` and
`enclavePublicKey()` matched what was passed in, and all four accounts held 10,000 USDC and 10 ETH.
