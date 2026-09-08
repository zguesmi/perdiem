# Build

Everything that turns the skeleton into the demo. Each package already carries its first red test,
taken from `docs/spec.md`; these tickets are what make those tests pass.

Ticket 01 blocked almost everything, on purpose: the Policy schema and the scoring formula are what
six packages have to agree on, and code written against a moving schema is code written twice. It is
resolved, and the schema it settled lives in `docs/spec.md`. Tickets 02, 03, 06 and 10 are open work
now; 04 still waits on the USDC decimals.

Blocking is recorded as a `Blocked by:` line. A ticket is ready when every file it names is
resolved.
