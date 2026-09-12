# Trim the panels the stepper replaced

Status: ready-for-agent Type: task Blocked by: 02, 03, 04

With the stepper and the balances in place, several facts appear twice: the state, both deadlines,
the payout cap, the winner, the payout and every transaction hash.

Every fact appears once on the page. The panels keep what only they can say: the policy hash, the
public requirements, the buyer, the commitment hashes, the ciphertext sizes, the bids root and the
booking id.

The page holds the stepper, the panels and the balances at the resolution the video records at,
with no scroll needed to see the stepper and the current panel together.

## Acceptance criteria

- [ ] No fact renders in two places.
- [ ] The panels keep the policy hash, the requirements, the commitments, the ciphertext sizes, the
      bids root and the booking id.
- [ ] The stepper stays visible while the panels are read.
- [ ] `ui/README.md` describes the page as it now is.

## Comments
