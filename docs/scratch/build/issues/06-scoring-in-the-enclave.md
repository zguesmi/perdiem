# Implement scoring inside the workflow

Status: ready-for-agent Type: task Blocked by: 01

`workflow/src/scoring.ts` still declares `distanceKm` and plain `number` prices. Ticket 01 settled
on `distanceMeters` and integer minor units, so correcting the stub's interface is part of the work.

Scope boundary: this ticket is the pure scoring function. The rest of the Enclave pipeline is
`docs/spec.md` step 7 and no ticket in this backlog owns it. That pipeline decrypts, checks the
signature, checks the commitment, and builds the Bids Root. Flagged, not fixed here.

`workflow/` already carries the demo table as a red test: three bids arrive, the cheapest loses, the
second cheapest wins at 440. Make it pass.

Nothing in this code path may be logged: not the Policy, not the maximum price, not the preferences,
not a decrypted bid. Grep the logs before committing any evidence.

## Acceptance criteria

- [ ] The demo table test passes: A ineligible, B scores 120, C scores 170, winner C, payout
      `440000000`.
- [ ] `cheapestEligibleAtMinStars` is computed before any trade-down check, and one test covers the
      case where no such bid exists, where a trade-down bid is eligible on `price <= maxPrice`
      alone.
- [ ] Ties break on lower price, then on lower supplier address. One test each.
- [ ] No eligible bid returns no winner and a payout of zero.
- [ ] The rule is not exported from `packages/core`, per `docs/adr/0002-scoring-is-not-shared.md`.
- [ ] The test output greps clean for the Policy, the maximum price, the preference numbers and any
      decrypted bid.

## Comments

## Dev review

Not reviewed yet.
