# One reference fixture that every hash implementation asserts against

Status: wontfix Type: task Blocked by: 02, 03

Dropped. The fixture file, the regeneration script and the Solidity assertions of `bidHash` and the
commitment are work the demo does not need. What the fixture was meant to protect is one hash, and
eight lines of test protect it.

Only one hash crosses a language boundary. `bidHash` and the Bid Commitment are produced in
TypeScript by the supplier agent and compared in TypeScript by the Enclave. `SealedAuction` stores
the commitment as an opaque `bytes32` and computes neither. The Bids Root is the only value both
languages compute: the Enclave builds it with `bidsRoot` in `shared/bid.ts`, and
`SealedAuction.bidsRoot` recomputes it in Solidity.

The two sides already agree. `onchain/test/SealedAuction.t.sol` pins `BIDS_ROOT` to
`0xffdbd9c1b65b61303d9298cfb6afcb3114a6ec8400b2280b102f32a581913b7f` and `SHUFFLED_BIDS_ROOT` to
`0x4bab02b90a0348eb8ab4956b0e013ef1c3d7a4d77ad3c9253857dd8d0e561d1f`, over the commitments
`keccak256("A")`, `keccak256("B")` and `keccak256("C")`. `bidsRoot` returns the same two values for
the same inputs, checked on 2026-09-11.

The gap left behind: `shared/bid.test.ts` asserts the shape of the root, never those literals, so a
change on the TypeScript side drifts silently. Ticket 05 now owns that assertion.

What this costs: no single file states the expected hashes, and a fourth implementation would have
to read two test files to find them. Acceptable while there are two.

## Comments

## Dev review

The bids root drops the sort: `keccak256(abi.encodePacked(commitments))` over the array in arrival
order. The fixture case is a shuffled arrival order, and the two orders must produce two different
roots.
