# Deploy the contracts to a local node

Status: ready-for-agent Type: task Blocked by: none (can start immediately)

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

- [ ] `onchain/scripts/deploy.ts` deploys `MockUSDC` and `SealedAuction` against a Hardhat node.
- [ ] It generates the X25519 keypair, passes the public half to the constructor, and writes the
      private half to `.env`.
- [ ] It mints USDC to the buyer and to three supplier addresses, enough for the Payout Cap and
      three Stakes.
- [ ] It writes the addresses and the enclave public key to one file, in a format the other packages
      import.
- [ ] Running it twice gives a clean deployment both times, with no manual cleanup.

## Comments

## Dev review

Not reviewed yet.
