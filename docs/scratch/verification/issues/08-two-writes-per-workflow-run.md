# Can one workflow run issue two writes to the same contract: `startSettling`, then the settlement?

Status: ready-for-human
Type: research
Blocked by: 01-cre-simulate-writes-to-arc.md

If not, the claim and the settlement go on separate cron ticks, and the simulation cron drops to
20 seconds so the demo does not stall waiting for the second tick.

## Acceptance criteria

- [ ] Row V8 is answered yes or no.
- [ ] If no, the cron interval for the demo is recorded, and `docs/spec.md` is updated from 60
      seconds.

## Comments
