# TypeScript tests

Solidity tests live beside the contracts, in `contracts/*.t.sol`. They cover the state machine,
access control, and anything else that is cheapest to express in Solidity.

This directory is for the tests that compare the chain against the rest of the repository.

`bid-hash-parity.test.ts` deploys `BidHash` and asserts it against
`packages/core/fixtures/bid-hash.json`, the same file the TypeScript tests in `packages/core` assert
against. The fixture is read from disk rather than imported, because `onchain` does not depend on
`@perdiem/core`: neither language can borrow the other's answer, which is the only thing that makes
the comparison worth running.

The Bids Root gets the same treatment once `SealedAuction` can recompute it.
