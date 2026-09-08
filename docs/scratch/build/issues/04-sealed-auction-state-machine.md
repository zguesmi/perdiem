# Implement the SealedAuction state machine and escrow

Status: ready-for-agent Type: task Blocked by: 01,
../verification/issues/05-arc-usdc-address-and-decimals.md

How real the decimals block is: the contract itself is decimal-agnostic, because every comparison is
between two amounts in the same unit. What the open row actually gates is the figures in the tests
and the `STAKE` constant. If verification 05 stalls, this ticket can be written with `STAKE` derived
from the decimal constant in `packages/core` and the test figures parameterised on it, and a late
answer changes numbers rather than code. Note that `SealedAuction.t.sol` already hardcodes `750e6`,
which is an assumption of 6 decimals that nothing has verified.

Created, Bidding, Settling, Finalized, Timeout. `createAuction` pulls the Budget, `commit` pulls the
Stake, `startSettling` claims the auction for the workflow, the settlement pays and refunds,
`submitReceipt` releases the winner's Stake, `slash` pays it to the buyer, `timeoutRefund` is the
escape hatch.

The invariants to test: money out never exceeds money in; no payout unless the Policy Hash and the
Bids Root both match; the buyer cannot withdraw between creation and settlement except through
`timeoutRefund`; Finalized and Timeout are terminal.

One test per row of the "Every USDC in and out" table in `docs/spec.md`. Nine hundred USDC enters
escrow in the demo — a 750 Budget and three 50 Stakes — and each of the five terminal paths returns
exactly that. Asserting the invariant as a sentence is not the same as asserting it as five numbers.

`pendingSettlement`, `commitmentsOf` and `auctionOf` are ticket 20, not this one, but the storage
this ticket chooses decides whether they are cheap. `commitmentsOf` needs the commitments as an
array, so a mapping alone is not enough.

Blocked on the USDC decimals, because every figure in the tests depends on them.

## Acceptance criteria

- [ ] Each of the five rows of “Every USDC in and out” is one test asserting exact balances for
      buyer, winner, losers and the contract, and the contract balance is zero at the end of each.
- [ ] `commit` is once per address, before `bidDeadline`, and pulls `STAKE`.
- [ ] The first commit moves `Created → Bidding` with no extra transaction.
- [ ] `startSettling` is rejected from a non-forwarder, outside `Bidding`, and before `bidDeadline`.
- [ ] `Finalized` and `Timeout` reject every further state-changing call.
- [ ] `timeoutRefund` before `finalizeDeadline` reverts.
- [ ] Deadlines that are not strictly increasing from now revert at creation. That test is already
      red in the repository.
- [ ] Commitments are stored per auction as an array, so `commitmentsOf` in ticket 20 is one read.

## Comments
