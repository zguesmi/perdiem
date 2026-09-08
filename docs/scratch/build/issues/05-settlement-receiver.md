# Accept the settlement from the CRE forwarder

Status: ready-for-agent
Blocked by: 04, ../verification/issues/01-cre-simulate-writes-to-arc.md

Use the Chainlink receiver template. Only the forwarder may call it, only in state Settling, and
only with a Policy Hash and a Bids Root that match what was committed.

Matching the Bids Root means recomputing it in Solidity:
`keccak256(abi.encodePacked(sorted))` over every 32-byte commitment for the auction, ascending as
unsigned big-endian, and `bytes32(0)` when there are none. Ticket 19 holds the fixture that keeps
this side and the Enclave's side byte-identical. `abi.encodePacked` and `abi.encode` produce
different roots, and a test written on one side alone passes with either.

Also decide and write down how the `Settlement` struct is encoded inside the report body, because the
Enclave encodes it and this function decodes it, and that is a fifth place two sides can disagree.

Blocked on knowing the forwarder address.

## Comments
