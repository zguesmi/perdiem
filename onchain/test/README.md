# TypeScript tests

Solidity tests live beside the contracts, in `contracts/*.t.sol`. They cover the state machine,
access control, and anything else that is cheapest to express in Solidity.

This directory is for the tests that need `@perdiem/core`: the EIP-712 bid struct hash, and the bids
root built over the sorted bid commitments. Both belong to
`docs/scratch/build/issues/19-cross-language-hash-parity-fixture.md`, so it is empty for now.

`SealedAuction` already builds the bids root in Solidity, and
`contracts/SealedAuctionSettlement.t.sol` asserts it against a literal computed off chain with viem.
That catches a sort that agrees with itself. It is not the parity test, which asserts the two
encoders byte for byte against one shared fixture.
