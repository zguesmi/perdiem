# Give the workflow and the page something to read

Status: ready-for-agent Type: task Blocked by: 04

The workflow holds no state of its own. Every 60 seconds the cron has to answer "is there an auction
to settle", and the Enclave has to answer "which commitments are on chain for it". Neither question
had a function until now.

Three views on `SealedAuction`, all specified in `docs/spec.md` under Functions:

- `pendingSettlement() → bytes32` — the lowest `auctionId` in `Bidding` with
  `block.timestamp >= bidDeadline`, or `bytes32(0)` when there is none.
- `commitmentsOf(auctionId) → bytes32[]` — arrival order. The Bids Root is built from this set.
- `auctionOf(auctionId) → Auction` — one call for the page and one for the workflow.

What has to be true:

- `pendingSettlement()` returns `bytes32(0)` when the only candidate auctions are `Created`,
  `Settling`, `Finalized` or `Timeout`. A workflow that claims a `Settling` auction a second time
  wastes a write and looks, in the demo, exactly like a bug in the settlement.
- It returns `bytes32(0)` before `bidDeadline`, even with commitments already in.
- `commitmentsOf` returns the empty array for an unknown auction rather than reverting, because the
  Enclave's no-commitment path is a legitimate one that ends in a refund.
- The scan is bounded. One buyer and a handful of auctions in the demo, so a loop from the lowest
  unsettled id is fine, but it needs a written bound rather than an unbounded loop over all history.

## Acceptance criteria

- [ ] `pendingSettlement()` returns `bytes32(0)` when the only candidates are `Created`, `Settling`,
      `Finalized` or `Timeout`.
- [ ] It returns `bytes32(0)` before `bidDeadline`, even with commitments already in.
- [ ] It returns the lowest eligible `auctionId` when several qualify.
- [ ] `commitmentsOf` returns the empty array for an unknown auction instead of reverting.
- [ ] `auctionOf` returns every field the page and the workflow read, as listed in `docs/spec.md`.
- [ ] The scan has a written bound, and one test drives more auctions than that bound.

## Comments
