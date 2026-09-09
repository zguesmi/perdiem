# What is the USDC ERC-20 address on Arc testnet, and how many decimals does it use?

Status: ready-for-human Type: research

`onchain/contracts/SealedAuction.t.sol` already assumes 6 decimals via `750e6`, which nothing has
verified.

Arc's native gas is USDC with 18 decimals. The ERC-20 used for escrow may differ. Do not hardcode 6
before checking: every Budget, Payout and Stake figure in the contract and the tests depends on
this.

## Acceptance criteria

- [x] Row V5 is answered with the ERC-20 address and the decimal count.
- [ ] The decimal count is written into the one constant in `packages/core`, not into a test.
- [ ] A funded buyer address and three funded supplier addresses exist.

## Comments
