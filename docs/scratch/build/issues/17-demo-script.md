# Drive the whole flow from one script

Status: ready-for-agent Type: task Blocked by: 05, 09, 11, 13, 14

`scripts/demo.sh` runs the flow end to end: intent, confirm, funding, three commits, three sealed
bids, settlement, booking, receipt. If the UI slips, this script is the demo.

## Acceptance criteria

- [ ] `scripts/demo.sh` runs intent, confirm, funding, three commits, three Sealed Bids, settlement,
      booking and receipt, and exits non-zero on the first failed step.
- [ ] It prints one line per step with a transaction hash or an HTTP status.
- [ ] It runs twice in a row with no manual cleanup, taking a fresh `auctionId` each time.
- [ ] Its runtime fits the demo deadlines: 90 seconds of bidding, 180 seconds to finalize.

## Comments

## Dev review

Not reviewed yet.
