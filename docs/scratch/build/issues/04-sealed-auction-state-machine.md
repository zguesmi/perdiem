# Implement the SealedAuction state machine and escrow

Status: ready-for-agent Type: task Blocked by: 01

USDC on Arc testnet has 6 decimals, verified on chain, so `SealedAuction.t.sol` hardcoding `750e6`
is correct. See `../verification/issues/05-arc-usdc-address-and-decimals.md`.

Created, Bidding, Settling, Finalized, Timeout. `createAuction` pulls the Budget, `commit` pulls the
Stake, `_startSettling` claims the auction for the workflow, the settlement pays and refunds,
`submitReceipt` releases the winner's Stake, `slash` pays it to the buyer, `timeoutRefund` is the
escape hatch.

`_startSettling` is internal. A workflow reaches it only through a kind `1` report to `onReport`,
which is ticket 05. This ticket owns the transition and its guards; ticket 05 owns the dispatch and
the forwarder check.

The invariants to test: money out never exceeds money in; no payout unless the Policy Hash and the
Bids Root both match; the buyer cannot withdraw between creation and settlement except through
`timeoutRefund`; Finalized and Timeout are terminal.

One test per row of the "Every USDC in and out" table in `docs/spec.md`. Nine hundred USDC enters
escrow in the demo, a 750 Budget and three 50 Stakes. Each of the five terminal paths returns
exactly that. Asserting the invariant as a sentence is not the same as asserting it as five numbers.

`pendingSettlement`, `commitmentsOf` and `auctionOf` are ticket 20, not this one, but the storage
this ticket chooses decides whether they are cheap. `commitmentsOf` needs the commitments as an
array, so a mapping alone is not enough.

Blocked on the USDC decimals, because every figure in the tests depends on them.

## Acceptance criteria

- [x] Each of the five rows of "Every USDC in and out" is one test asserting exact balances for
      buyer, winner, losers and the contract, and the contract balance is zero at the end of each.
- [x] `commit` is once per address, before `bidDeadline`, and pulls `STAKE`.
- [x] The first commit moves `Created → Bidding` with no extra transaction.
- [x] `_startSettling` is rejected outside `Bidding` and before `bidDeadline`. The non-forwarder
      caller is ticket 05's test, because the forwarder check lives on `onReport`.
- [x] `Finalized` and `Timeout` reject every further state-changing call.
- [x] `timeoutRefund` before `finalizeDeadline` reverts.
- [x] Deadlines that are not strictly increasing from now revert at creation. That test is already
      red in the repository.
- [x] Commitments are stored per auction as an array, so `commitmentsOf` in ticket 20 is one read.

## Comments

Built across four pull requests, so that each stays near the 400 changed lines the repository asks
for: creation and escrow, `commit`, claim and settlement, then delivery.

Two things the ticket did not decide, decided here:

- `timeoutRefund` accepts `Created`. Row five of "Every USDC in and out" is an auction nobody
  committed to, so it never leaves `Created`, and its Budget is stuck forever without this.
  `docs/spec.md` said `Bidding` or `Settling` and is corrected.
- A settlement with a named winner and a zero Payout is rejected. The Payout is the winning Bid's
  price, and a winner paid nothing would have its Stake held against a delivery nobody bought.

`viaIR` is on in both solc profiles. `createAuction` emits all seven of its arguments and the legacy
pipeline fails with "Stack too deep" on that emit.

The Solidity Bids Root asserts against a literal computed off chain with viem. That is not the
cross-language parity test, which stays with ticket 19.

47 Solidity tests pass.
