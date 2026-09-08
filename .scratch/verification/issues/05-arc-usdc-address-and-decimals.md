# What is the USDC ERC-20 address on Arc testnet, how many decimals does it use, and what are the faucet limits?

Status: ready-for-human

Arc's native gas is USDC with 18 decimals. The ERC-20 used for escrow may differ. Do not
hardcode 6 before checking: every Budget, Payout and Stake figure in the contract and the tests
depends on this.

Faucet amounts and rate limit matter too, because the demo needs a funded buyer and three funded
suppliers.

## Comments
