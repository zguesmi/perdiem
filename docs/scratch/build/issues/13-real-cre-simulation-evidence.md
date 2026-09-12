# Swap the fake handler runner for the real CRE and capture the evidence

Status: resolved Type: task Blocked by: 05, 06, 12, 30

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

- [x] One full `cre workflow simulate` run is saved to
      `docs/scratch/verification/evidence/simulate-<date>.log` and is committed. The
      `!docs/scratch/verification/evidence/*.log` rule is already in `.gitignore`, so confirm with
      `git status --ignored` rather than editing the file again.
- [x] The fake handler runner is deleted, not left beside the real path.
- [x] The log greps clean for the Policy, the maximum price, the preference numbers, the enclave
      private key and any decrypted Bid.
- [x] The run claims the auction with an action `1` report and writes an action `2` settlement the
      contract accepts, both in one execution.

## Comments

## Dev review

The report `kind` is an `action`. The run claims with action `1` and settles with action `2`.

## Close-out

`docs/scratch/verification/evidence/simulate-2026-09-12.log` is the committed run, tracked by the
`!docs/scratch/verification/evidence/*.log` rule at `.gitignore:17`. No handler runner exists beside
the real path: `onCronTrigger` has one caller, `initWorkflow`, and the tests cover `scoring`,
`enclave` and `booking` only.

The log greps clean for the policy, the maximum price, the preference numbers, the enclave private
key and any decrypted bid.

`write` throws unless `txStatus` is `SUCCESS`, so the returned `settled <auctionId>` is only reached
after both the action `1` claim and the action `2` settlement are mined in that execution.

The handler now names each step, so a later run reads the sequence off the log rather than inferring
it from the return value:

```
[USER LOG] Pending auction: 0x…
[USER LOG] Claimed auction: 0x…
[USER LOG] ScoredBids:3, droppedBids:0 (decrypt=0, signature=0 commitment=0)
[USER LOG] Settled auction: 0x…
```

The committed log predates those lines. An idle run against Arc testnet on 2026-09-12 returns
`No pending auction`, which is the empty path of the same build.
