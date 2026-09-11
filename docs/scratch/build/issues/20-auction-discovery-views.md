# Give the workflow and the page something to read

Status: resolved Type: task Blocked by: 04

The workflow holds no state of its own. Every 60 seconds the cron has to answer "is there an auction
to settle", and the Enclave has to answer "which commitments are on chain for it". Neither question
had a function until now.

Three views on `SealedAuction`, all specified in `docs/spec.md` under Functions:

- `pendingSettlement() → bytes32` — an `auctionId` in `Bidding` with
  `block.timestamp >= bidDeadline`, or `bytes32(0)` when there is none.
- `commitments(auctionId) → bytes32[]` — arrival order. The Bids Root is built from this array.
  Shipped with ticket 04, alongside `committers`, `commitmentOf` and `hasCommitted`.
- `auctions(auctionId) → Auction` — the public mapping's generated getter. Shipped with ticket 04.

`auctionId` is the keccak256 of the auction record, so there is no counter to scan and no order to
walk. `pendingSettlement` needs a list of open auction ids, written by `createAuction` and cleared
on `Finalized` and `Timeout`. That list is this ticket's real work.

What has to be true:

- `pendingSettlement()` returns `bytes32(0)` when the only candidate auctions are `Created`,
  `Settling`, `Finalized` or `Timeout`. A workflow that claims a `Settling` auction a second time
  wastes a write and looks, in the demo, exactly like a bug in the settlement.
- It returns `bytes32(0)` before `bidDeadline`, even with commitments already in.
- `commitments` returns the empty array for an unknown auction rather than reverting, because the
  Enclave's no-commitment path is a legitimate one that ends in a refund.
- The scan is bounded. It walks the open list, which shrinks on every terminal transition, and it
  needs a written bound rather than an unbounded loop.

## Acceptance criteria

- [x] `pendingSettlement()` returns `bytes32(0)` when the only candidates are `Created`, `Settling`,
      `Finalized` or `Timeout`.
- [x] It returns `bytes32(0)` before `bidDeadline`, even with commitments already in.
- [x] It returns an eligible `auctionId` when several qualify, and every one of them in turn as each
      is settled.
- [x] `commitments` returns the empty array for an unknown auction instead of reverting. Ticket 04.
- [x] `auctions` returns every field the page and the workflow read, as listed in `docs/spec.md`.
      Ticket 04.
- [x] The open list drops an auction on `Finalized` and on `Timeout`, and one test drives both.
- [x] The scan has a written bound, and one test drives more auctions than that bound.

## Comments

## Dev review

`commitments`, `committers`, `commitmentOf`, `hasCommitted` and the `auctions` getter shipped with
ticket 04.

`auctionId` is the keccak256 of the auction record, so there is no counter to scan.
`pendingSettlement` needs a list of open auction ids, and that list is what is left of this ticket.

## Resolution

`_openAuctions` is a `bytes32[]`. `createAuction` pushes, `_settle` and `timeoutRefund` remove by
swap and pop. `pendingSettlement` walks it and returns the first auction in `Bidding` past its
`bidDeadline`.

The bound is `MAX_OPEN_AUCTIONS`, 32. `createAuction` reverts with `OpenAuctionLimitReached` at the
ceiling. Cost of that: the 32 slots are shared by every buyer, and a slot is held until its auction
reaches `Finalized` or `Timeout`. A rejected settlement therefore holds one for `FINALIZE_PERIOD`, 4
hours, because `pendingSettlement` skips a `Settling` auction and nothing else frees the slot.

Removal is a linear walk over at most 32 entries rather than a second mapping, matching
`commitmentOf`. Cost of that: up to 32 extra storage reads on every settlement.
