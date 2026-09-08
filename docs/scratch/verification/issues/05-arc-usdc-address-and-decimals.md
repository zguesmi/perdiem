# What is the USDC ERC-20 address on Arc testnet, how many decimals does it use, and what are the faucet limits?

Status: ready-for-human
Type: research

`onchain/contracts/SealedAuction.t.sol` already assumes 6 decimals via `750e6`, which nothing has
verified.

Arc's native gas is USDC with 18 decimals. The ERC-20 used for escrow may differ. Do not
hardcode 6 before checking: every Budget, Payout and Stake figure in the contract and the tests
depends on this.

Faucet amounts and rate limit matter too, because the demo needs a funded buyer and three funded
suppliers.

## Acceptance criteria

- [ ] Row V5 is answered with the ERC-20 address, the decimal count and the faucet amount and rate
      limit.
- [ ] The decimal count is written into the one constant in `packages/core`, not into a test.
- [ ] A funded buyer address and three funded supplier addresses exist, with the faucet output as
      evidence.

## Comments
