# Implement scoring inside the workflow

Status: ready-for-agent
Blocked by: 01

`workflow/` already carries the demo table as a red test: three bids arrive, the cheapest loses,
the second cheapest wins at 440. Make it pass.

Nothing in this code path may be logged: not the Policy, not the maximum price, not the preferences,
not a decrypted bid. Grep the logs before committing any evidence.

## Comments
