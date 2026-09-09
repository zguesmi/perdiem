# TypeScript tests

Solidity tests live beside the contracts, in `contracts/*.t.sol`. They cover the state machine,
access control, and anything else that is cheapest to express in Solidity.

This directory is for the tests that need `@perdiem/core`: the EIP-712 bid struct hash, and the bids
root built over the sorted bid commitments. Both are blocked until
`docs/scratch/build/issues/01-policy-schema-and-scoring-formula.md` settles the schema, so it is
empty for now.
