# One golden fixture that every hash implementation asserts against

Status: done Type: task Blocked by: 02, 03

A Solidity assertion of the Bids Root needs a Solidity function that computes it, and that function
is ticket 05. So this ticket ships the fixture, the regeneration script, the TypeScript assertions
of all four hashes, and the Solidity assertions of `bidHash` and the commitment. The Bids Root
assertion in Solidity is an acceptance criterion of 05, against this fixture.

Three hashes cross a language boundary, and each one kills an auction silently when the two sides
disagree:

| Hash                               | Produced by                | Compared by                                     |
| ---------------------------------- | -------------------------- | ----------------------------------------------- |
| `bidHash`, the EIP-712 struct hash | supplier agent, TypeScript | the Enclave, checking signatures                |
| Bid Commitment                     | supplier agent, TypeScript | the contract stores it, the Enclave rechecks it |
| Bids Root                          | the Enclave, TypeScript    | the contract, recomputing it in Solidity        |

The Policy Hash is not in this list. It is produced in TypeScript and compared in TypeScript: the
requisition service and the Enclave both call one `canonicalJson` in `shared/`, and the contract
only compares the bytes32 it was given against the bytes32 it stored. Its canonical bytes and hash
are asserted as literals in `shared/policy-hash.test.ts`. See `docs/adr/0003-canonical-encoding.md`.

Rather than testing each side against its own expectation, there is one fixture file: a Bid, a salt,
and the three hex strings those inputs must produce. Every side asserts against that file and no
side computes its own expected value.

This is the only new test seam this feature needs. It sits above all three implementations, so a
divergence names itself: the failing test says which hash and which side.

What has to be true:

- The fixture is in `shared/`, so `workflow/` and the supplier agents import it by relative path and
  the Solidity tests read the same JSON from disk.
- The TypeScript test asserts all three.
- A Solidity test asserts the `bidHash`, the commitment and the Bids Root against the same strings.
- The Bids Root case uses at least three commitments in a deliberately shuffled arrival order, so
  that the ascending-byte sort is exercised, and one case with no commitments, which is
  `bytes32(0)`.
- Regenerating the fixture is a script, not a hand edit, and the script is what runs when `version`
  changes.

The rule stated in `docs/spec.md` is exact on purpose:
`bidsRoot = keccak256(abi.encodePacked(commitments))` over the 32-byte commitments in arrival
big-endian, and `bytes32(0)` for the empty set. `abi.encodePacked` and `abi.encode` differ here, and
picking the wrong one passes every test written on one side alone.

## Acceptance criteria

- [x] The fixture is in `shared/`, is importable by TypeScript, and is readable as JSON from disk by
      the Solidity tests.
- [x] It carries a Bid, a salt, at least three commitments in a deliberately shuffled arrival order,
      one empty set, and the three expected hex strings.
- [x] The TypeScript test asserts `bidHash`, the commitment and the Bids Root against the file.
- [x] A Solidity test asserts `bidHash` and the commitment against the same strings.
- [x] Regenerating is a script, not a hand edit, and the ticket says to run it when `version`
      changes.
- [x] No side computes its own expected value.

## Comments

## Dev review

The bids root drops the sort: `keccak256(abi.encodePacked(commitments))` over the array in arrival
order. The fixture case is a shuffled arrival order, and the two orders must produce two different
roots.

`shared/fixtures/bid-hashes.json` holds the inputs and all three hashes.
`shared/regenerate-bid-fixture.ts` writes it, and `pnpm fixtures` runs it.

The Solidity assertions run as a `node:test` file, `onchain/test/bid-hashes.ts`, which reads the
JSON from disk and calls Solidity through viem. A `.t.sol` file would have to parse the nested bid
struct with `vm.parseJson`, which needs the struct fields in alphabetical order and gives a worse
failure message. The hashing itself is Solidity, in `onchain/test/BidHashes.sol`.

The Bids Root assertion is here rather than in ticket 05, because it is the assertion that gates a
settlement and it cost thirty lines in the same file.

`onchain/test/SealedAuction.t.sol` still carries two Bids Root literals of its own, computed off
chain. They cover a different commitment set and were left alone.
