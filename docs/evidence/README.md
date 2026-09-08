# Evidence

Terminal output and logs behind the answers in `docs/decisions.md`, and the simulation runs the
Chainlink prize accepts as evidence.

A row in `docs/decisions.md` is not closed until its output is in this directory, and the row names
the file.

## What lands here

- `simulate-<date>.log` — one full `cre workflow simulate` run, per
  `docs/scratch/build/issues/13-real-cre-simulation-evidence.md`.
- One file per closed verification ticket, named after the ticket.

## The root `.gitignore` excludes these files today

`.gitignore` contains `*.log`, so `docs/evidence/simulate-<date>.log` is ignored and a
`git add` of it does nothing without `-f`. The Chainlink prize accepts simulation output as its
evidence, so an ignored log is a submission with no evidence in it.

The fix is one line in the root `.gitignore`, below the `*.log` rule:

```
!docs/evidence/*.log
```

Until that line exists, use `git add -f docs/evidence/<file>.log` and check `git status` afterwards.

## Before committing a log

Grep it for the Policy, the maximum price, the preferences, the enclave private key and any
decrypted Bid. None of those may appear in a committed log. That check is part of the ticket that
produces the log, not an afterthought.
