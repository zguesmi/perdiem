# Remove the receipt phase from the contract

Status: ready-for-agent Type: task Blocked by: none (can start immediately)

Ticket 04 shipped a delivery phase the contract cannot check. `submitReceipt` accepts any `bytes32`
from the winner and releases the Stake, so the proof costs a winner nothing to fabricate. The
booking now arrives inside the settlement instead. See
`docs/adr/0006-the-enclave-books-with-supplier-credentials.md`.

This ticket changes code that is already merged, in `onchain/contracts/SealedAuction.sol` and its
762-line test file. Twenty-one test references name `submitReceipt` or `slash`.

Delete: `submitReceipt`, `slash`, `receiptDeadline`, `RECEIPT_PERIOD`, `stakeReleased`,
`stakeSlashed`, `ReceiptPosted`, `StakeSlashed`, and every error only those paths raise.

Add: a `string bookingId` field on `Settlement`, checked and then emitted.

`AuctionFinalized` becomes
`AuctionFinalized(bytes32 indexed auctionId, address indexed winner, uint256 payout, string bookingId)`.
No new event: the booking id is part of finalizing, not a second thing that happens later.

The Stake stays. It binds a commitment to a supplier that has funds, and every Stake comes back at
settlement.

`auctionId` is `keccak256` over the auction record, so dropping `receiptDeadline` from that struct
changes every identifier. Any fixture that pins one has to be regenerated.

## Acceptance criteria

- [ ] `submitReceipt`, `slash` and their state fields, deadlines, events and errors are gone.
- [ ] `Settlement` carries `string bookingId`, and a settlement with a winner and an empty
      `bookingId` reverts. One test states it.
- [ ] `winner == address(0)` still settles with an empty `bookingId`, refunds the Payout Cap and
      every Stake, and finalizes.
- [ ] The winner's Stake is refunded at settlement like every other Stake.
- [ ] `AuctionFinalized` carries the booking id.
- [ ] The auction record no longer carries `receiptDeadline`, `stakeReleased` or `stakeSlashed`, and
      any fixture pinning an `auctionId` is regenerated.
- [ ] The four rows of "Every USDC in and out" in `docs/spec.md` are each a passing test.

## Comments

## Dev review

Not reviewed yet.
