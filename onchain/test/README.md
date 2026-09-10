# Tests

`SealedAuction.t.sol` covers the contract: escrow, the state machine, access control, and every
terminal path. `MockUSDC.sol` is the six-decimal ERC-20 it runs against.

TypeScript tests belong here too, for anything that needs `@perdiem/core`: the EIP-712 bid struct
hash, and the bids root built over the sorted bid commitments. Both belong to
`docs/scratch/build/issues/19-cross-language-hash-parity-fixture.md`, so there are none yet.

`SealedAuction` already builds the bids root in Solidity, and `SealedAuction.t.sol` asserts it
against a literal computed off chain with viem. That catches a sort that agrees with itself. It is
not the parity test, which asserts the two encoders byte for byte against one shared fixture.
