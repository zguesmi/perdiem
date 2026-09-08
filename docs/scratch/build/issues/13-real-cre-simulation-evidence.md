# Swap the fake handler runner for the real CRE and capture the evidence

Status: ready-for-human
Blocked by: 06, 12

A fake runner may execute the handler while it is being built. Only `cre workflow simulate`
produces the logs in `docs/evidence/`. This ticket is the moment that swap happens, and it is not
optional: simulation output is what the Chainlink prize accepts as evidence.

Save one full run to `docs/evidence/simulate-<date>.log` and grep it for the Policy before
committing.

## Comments
