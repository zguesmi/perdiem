# Show the USDC balances that move

Status: resolved Type: task Blocked by: 01, 02

Nothing on the page shows the money. A viewer sees a payout cap and a payout, but never watches 900
USDC enter escrow and 900 USDC leave it.

One panel, five rows, re-read on the same two second poll: the escrow contract, the buyer, and each
supplier that committed. Supplier addresses come from the `Committed` logs the page already reads,
so no address is configured.

The escrow row is the one that tells the story: the payout cap plus one stake per commitment while
bidding runs, zero once the auction is finalized or refunded.

## Acceptance criteria

- [ ] The USDC address is read from `SealedAuction.usdc()`, not configured.
- [ ] The escrow, the buyer and every committed supplier show a USDC balance.
- [ ] Balances refresh on the existing poll, in one multicall-free batch of reads.
- [ ] A supplier that committed but whose row has no balance yet renders, rather than disappearing.
- [ ] An RPC failure leaves the last balance on screen and does not blank the panel.

## Design

The rules the page is built to: `docs/scratch/ui/spec.md`.

## Comments
