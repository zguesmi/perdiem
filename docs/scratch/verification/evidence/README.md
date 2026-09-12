# Evidence

Terminal output and logs behind the answers in `docs/decisions.md`, and the simulation runs the
Chainlink prize accepts as evidence.

A row in `docs/decisions.md` is not closed until its output is in this directory, and the row names
the file.

## What lands here

- `simulate-<date>.log` — one full `cre workflow simulate` run, per
  `docs/scratch/build/issues/13-real-cre-simulation-evidence.md`.
- One file per closed verification ticket, named after the ticket.
- `privy-spend-policy-and-quorum.md` — the buyer's spend policy and key quorum, per
  `docs/scratch/build/issues/11-privy-funding-with-quorum.md`.

## Before committing a log

Grep it for the Policy, the maximum price, the preferences, the enclave private key and any
decrypted Bid. None of those may appear in a committed log. That check is part of the ticket that
produces the log, not an afterthought.
