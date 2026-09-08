# Build

Everything that turns the skeleton into the demo. Each package already carries its first red test,
taken from `docs/spec.md`; these tickets are what make those tests pass.

Ticket 01 blocks almost everything, on purpose. The Policy schema and the scoring formula are what
six packages have to agree on, and code written against a moving schema is code written twice.

Blocking is recorded as a `Blocked by:` line. A ticket is ready when every file it names is
resolved.
