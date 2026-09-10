# Accept the settlement from the CRE forwarder

Status: ready-for-agent Type: task Blocked by: 04, 19,
../verification/issues/01-cre-simulate-writes-to-arc.md

`onReport`, the forwarder check and the action dispatch shipped with ticket 04, because the tests
there needed the real entry rather than a harness. What is left here: `supportsInterface`, the
Chainlink receiver template, and the assertions against ticket 19's fixture.

The Bids Root fixture ships in 19; the Solidity assertion against it ships here, because it needs
this function to exist.

Use the Chainlink receiver template. Only the forwarder may call it, only in state Settling, and
only with a Policy Hash and a Bids Root that match what was committed.

`onReport` carries both workflow writes and dispatches on an action, because it is the only entry a
workflow has. The `evm@1.0.0` capability has one write RPC, `writeReport`, and its request has no
calldata field, so a workflow cannot call `_startSettling` or any other function on the receiver.
Row V8.

- `report` is `abi.encode(uint8 action, bytes payload)`. Action `1` is the claim, action `2` is the
  settlement. An unknown action reverts.
- The claim payload is `abi.encode(bytes32 auctionId)`. The settlement payload is
  `abi.encode(Settlement)`.
- `_startSettling(auctionId)` is internal, reached only through action `1`. It still requires
  `Bidding` and `block.timestamp >= bidDeadline`.
- The action cannot live in `metadata`: `reportId` is `0001` for every report in one run, so a
  receiver cannot tell the claim from the settlement there. Row V8.
- Do not dispatch by calling `report` as calldata. That turns `onReport` into an arbitrary-call
  surface guarded only by `msg.sender`.
- A reverting `onReport` is invisible to the workflow. The forwarder emits
  `ReportProcessed(result: false)` and the workflow still reads `TxStatus.SUCCESS`, so the auction
  sits in `Settling` until `timeoutRefund`. Rows V1 and V8.

Matching the Bids Root means recomputing it in Solidity: `keccak256(abi.encodePacked(commitments))`
over every 32-byte commitment for the auction, in arrival order, and `bytes32(0)` when there are
none. Ticket 19 holds the fixture that keeps this side and the Enclave's side byte-identical.
`abi.encodePacked` and `abi.encode` produce different roots, and a test written on one side alone
passes with either.

Also decide and write down how the `Settlement` struct is encoded inside the report body, because
the Enclave encodes it and this function decodes it, and that is a fifth place two sides can
disagree.

Blocked on knowing the forwarder address. It is `0x6e9ee680ef59ef64aa8c7371279c27e496b5edc1` in
simulation, per row V1.

## Acceptance criteria

- [x] Only the forwarder may call `onReport`. Every other caller reverts. Ticket 04.
- [x] Action `1` moves `Bidding → Settling` and requires `block.timestamp >= bidDeadline`. Action
      `2` settles. An unknown action reverts. Ticket 04.
- [x] An action `2` report before any action `1` report reverts. Ticket 04.
- [x] A settlement in `Created`, `Bidding`, `Finalized` or `Timeout` reverts. Only `Settling`
      accepts one. Ticket 04.
- [x] A wrong Policy Hash reverts. A wrong Bids Root reverts. A Payout above the Payout Cap reverts.
      A winner that never committed reverts. Ticket 04.
- [x] `winner == address(0)` with `payout == 0` refunds the Payout Cap and every Stake and
      finalizes. Ticket 04.
- [ ] The Solidity Bids Root recompute asserts against ticket 19's fixture, including a shuffled
      arrival order case and the empty case, which is `bytes32(0)`.
- [ ] The encoding of `Settlement` inside the report body is written down, and one test decodes a
      payload produced by the Enclave's encoder rather than by the test itself.
- [ ] The action prefix is written down with it, and one test decodes a two-write sequence the
      workflow produced rather than one the test built.

## Comments

## Dev review

`onReport`, the `onlyForwarder` modifier and the action dispatch moved from this ticket into ticket
04, because the tests there needed the real entry rather than a harness. What is left:
`supportsInterface`, the Chainlink receiver template, and the assertions against ticket 19's
fixture.

The report `kind` is an `action`. The bids root is hashed in arrival order, with no sort.
