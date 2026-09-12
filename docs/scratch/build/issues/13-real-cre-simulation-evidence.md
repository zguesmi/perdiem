# Swap the fake handler runner for the real CRE and capture the evidence

Status: ready-for-human Type: task Blocked by: 05, 06, 12

A fake runner may execute the handler while it is being built. Only `cre workflow simulate` produces
the logs in `docs/scratch/verification/evidence/`. This ticket is the moment that swap happens, and
it is not optional: simulation output is what the Chainlink prize accepts as evidence.

Save one full run to `docs/scratch/verification/evidence/simulate-<date>.log` and grep it for the
Policy, the maximum price, the preferences, the enclave private key and any decrypted Bid before
committing.

The root `.gitignore` has `*.log`, so that file is ignored today and `git add` on it silently does
nothing. Add `!docs/scratch/verification/evidence/*.log` below the `*.log` rule, or the prize
submission ships with no evidence in it. Check `git status` after adding, not before.

## Acceptance criteria

- [ ] One full `cre workflow simulate` run is saved to
      `docs/scratch/verification/evidence/simulate-<date>.log` and is committed. The
      `!docs/scratch/verification/evidence/*.log` rule is already in `.gitignore`, so confirm with
      `git status --ignored` rather than editing the file again.
- [ ] The fake handler runner is deleted, not left beside the real path.
- [ ] The log greps clean for the Policy, the maximum price, the preference numbers, the enclave
      private key and any decrypted Bid.
- [ ] The run claims the auction with an action `1` report and writes an action `2` settlement the
      contract accepts, both in one execution.

## Comments

## Dev review

The report `kind` is an `action`. The run claims with action `1` and settles with action `2`.
