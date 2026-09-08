# Build

Everything that turns the skeleton into the demo. Each package already carries its first red test,
taken from `docs/spec.md`; these tickets are what make those tests pass.

Ticket 01 blocked almost everything, on purpose: the Policy schema and the scoring formula are what
six packages have to agree on, and code written against a moving schema is code written twice. It is
resolved, and the schema it settled lives in `docs/spec.md`.

Each ticket carries a `Status:` line, a `Type:` line, a `Blocked by:` line and its acceptance
criteria. A ticket is ready when every file it names is resolved. Ticket numbers are references, so
a later ticket that turns out to block an earlier one is not renumbered: read the `Blocked by:`
lines, not the numbering.

## Known gaps, not yet ticketed

- The Enclave pipeline around scoring — decrypt, check each signature, check each commitment, build
  the Bids Root — is `docs/spec.md` step 7 and belongs to no ticket. Ticket 06 is the pure scoring
  function only.
- Tickets 10 and 21 overlap.
- Ticket 16 delivers documentation only and overlaps 18.
- Tickets 04 and 15 are each larger than one context window.
