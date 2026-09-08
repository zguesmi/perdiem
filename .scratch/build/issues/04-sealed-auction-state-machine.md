# Implement the SealedAuction state machine and escrow

Status: ready-for-agent
Blocked by: 01, ../verification/issues/05-arc-usdc-address-and-decimals.md

Created, Bidding, Settling, Finalized, Timeout. `createAuction` pulls the Budget, `commit` pulls
the Stake, `startSettling` claims the auction for the workflow, the settlement pays and refunds,
`submitReceipt` releases the winner's Stake, `slash` pays it to the buyer, `timeoutRefund` is the
escape hatch.

The invariants to test: money out never exceeds money in; no payout unless the Policy Hash and the
Bids Root both match; the buyer cannot withdraw between creation and settlement except through
`timeoutRefund`; Finalized and Timeout are terminal.

Blocked on the USDC decimals, because every figure in the tests depends on them.

## Comments
