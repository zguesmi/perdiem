# One golden fixture that every hash implementation asserts against

Status: ready-for-agent Type: task Blocked by: 02, 03

A Solidity assertion of the Bids Root needs a Solidity function that computes it, and that function
is ticket 05. So this ticket ships the fixture, the regeneration script, the TypeScript assertions
of all four hashes, and the Solidity assertions of `bidHash` and the commitment. The Bids Root
assertion in Solidity is an acceptance criterion of 05, against this fixture.

Four hashes have to agree across three languages, and each one kills an auction silently when it
does not:

| Hash                               | Produced by                     | Compared by                                     |
| ---------------------------------- | ------------------------------- | ----------------------------------------------- |
| Policy Hash                        | requisition service, TypeScript | the contract, against the Enclave's             |
| `bidHash`, the EIP-712 struct hash | supplier agent, TypeScript      | the Enclave, checking signatures                |
| Bid Commitment                     | supplier agent, TypeScript      | the contract stores it, the Enclave rechecks it |
| Bids Root                          | the Enclave, TypeScript         | the contract, recomputing it in Solidity        |

Rather than testing each side against its own expectation, there is one fixture file: a Policy, a
Bid, a salt, and the four hex strings those inputs must produce. Every side asserts against that
file and no side computes its own expected value.

This is the only new test seam this feature needs. It sits above all four implementations, so a
divergence names itself: the failing test says which hash and which side.

What has to be true:

- The fixture lives in `packages/core` and is exported, so `workflow/` and the supplier agents can
  import it and the Solidity tests can read the same JSON from disk.
- The TypeScript test asserts all four.
- A Solidity test asserts the `bidHash`, the commitment and the Bids Root against the same strings.
  The Policy Hash has no Solidity side; the contract only compares what it was given.
- The Bids Root case uses at least three commitments in a deliberately unsorted arrival order, so
  that the ascending-byte sort is actually exercised, and one case with no commitments, which is
  `bytes32(0)`.
- Regenerating the fixture is a script, not a hand edit, and the script is what runs when `version`
  changes.

The rule stated in `docs/spec.md` is exact on purpose:
`bidsRoot = keccak256(abi.encodePacked(sorted))` over the 32-byte commitments ascending as unsigned
big-endian, and `bytes32(0)` for the empty set. `abi.encodePacked` and `abi.encode` differ here, and
picking the wrong one passes every test written on one side alone.

## Acceptance criteria

- [ ] The fixture lives in `packages/core`, is exported for TypeScript, and is readable as JSON from
      disk by the Solidity tests.
- [ ] It carries a Policy, a Bid, a salt, at least three commitments in a deliberately unsorted
      arrival order, one empty set, and the four expected hex strings.
- [ ] The TypeScript test asserts the Policy Hash, `bidHash`, the commitment and the Bids Root
      against the file.
- [ ] A Solidity test asserts `bidHash` and the commitment against the same strings.
- [ ] Regenerating is a script, not a hand edit, and the ticket says to run it when `version`
      changes.
- [ ] No side computes its own expected value.

## Comments
