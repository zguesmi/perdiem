# Accept the settlement from the CRE forwarder

Status: ready-for-agent
Type: task
Blocked by: 04, 19, ../verification/issues/01-cre-simulate-writes-to-arc.md

The Bids Root fixture ships in 19; the Solidity assertion against it ships here, because it needs
this function to exist.

Use the Chainlink receiver template. Only the forwarder may call it, only in state Settling, and
only with a Policy Hash and a Bids Root that match what was committed.

Matching the Bids Root means recomputing it in Solidity:
`keccak256(abi.encodePacked(sorted))` over every 32-byte commitment for the auction, ascending as
unsigned big-endian, and `bytes32(0)` when there are none. Ticket 19 holds the fixture that keeps
this side and the Enclave's side byte-identical. `abi.encodePacked` and `abi.encode` produce
different roots, and a test written on one side alone passes with either.

Also decide and write down how the `Settlement` struct is encoded inside the report body, because
the
Enclave encodes it and this function decodes it, and that is a fifth place two sides can disagree.

Blocked on knowing the forwarder address.

## Acceptance criteria

- [ ] Only the forwarder may call `onReport`. Every other caller reverts.
- [ ] A settlement in `Created`, `Bidding`, `Finalized` or `Timeout` reverts. Only `Settling`
      accepts one.
- [ ] A wrong Policy Hash reverts. A wrong Bids Root reverts. A Payout above the Budget reverts. A
      winner that never committed reverts.
- [ ] `winner == address(0)` with `payout == 0` refunds the Budget and every Stake and finalizes.
- [ ] The Solidity Bids Root recompute asserts against ticket 19's fixture, including the unsorted
      arrival order case and the empty case, which is `bytes32(0)`.
- [ ] The encoding of `Settlement` inside the report body is written down, and one test decodes a
      payload produced by the Enclave's encoder rather than by the test itself.

## Comments
