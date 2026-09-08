# Can one workflow run issue two writes to the same contract: `startSettling`, then the settlement?

Status: ready-for-human

If not, the claim and the settlement go on separate cron ticks, and the simulation cron drops to
20 seconds so the demo does not stall waiting for the second tick.

## Comments
