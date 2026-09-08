# Swap the fake handler runner for the real CRE and capture the evidence

Status: ready-for-human
Blocked by: 06, 12

A fake runner may execute the handler while it is being built. Only `cre workflow simulate`
produces the logs in `docs/evidence/`. This ticket is the moment that swap happens, and it is not
optional: simulation output is what the Chainlink prize accepts as evidence.

Save one full run to `docs/evidence/simulate-<date>.log` and grep it for the Policy, the maximum
price, the preferences, the enclave private key and any decrypted Bid before committing.

The root `.gitignore` has `*.log`, so that file is ignored today and `git add` on it silently does
nothing. Add `!docs/evidence/*.log` below the `*.log` rule, or the prize submission ships with no
evidence in it. Check `git status` after adding, not before.

## Comments
