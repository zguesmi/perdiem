# Show the auction as a stepper

Status: resolved Type: task Blocked by: 01, 02

The page names the auction state in one line of text. A viewer cannot see which transitions already
happened, which one is running, or how long is left before the next one.

A stepper across the top of the page, above the panels: Created, Bidding, Settling, Finalized. A
timed-out auction replaces the last step with Timeout rather than adding a sixth. Past steps read as
done, the current step as live, later steps as pending.

Each step carries one line and no more:

- Created: the payout cap locked in escrow.
- Bidding: how many suppliers committed, and the time left before `bidDeadline`.
- Settling: the time left before `finalizeDeadline`.
- Finalized: the winner and the payout, or that no bid was eligible.
- Timeout: what was refunded.

The countdown ticks every second, separately from the two second chain poll. It reads zero and stops
rather than counting into negative time.

## Acceptance criteria

- [ ] Five steps, with Timeout replacing Finalized on a timed-out auction.
- [ ] Done, live and pending steps are distinguishable without reading the text.
- [ ] Each step shows one line of information, and no step shows a transaction hash yet.
- [ ] The countdown ticks every second and holds at zero once a deadline passes.
- [ ] The state line the stepper replaces is gone from the page.
- [ ] The stepper reads only the auction view the hook already returns.

## Design

The rules the page is built to: `docs/scratch/ui/spec.md`.

## Comments
