# Split the page into a polling hook and panel files

Status: ready-for-agent Type: task Blocked by: none

`ui/src/App.tsx` holds the poll, the layout and all five panels in one file. The stepper, the
transaction rows and the balances all edit it, so they collide.

No visual change. The rendered page before and after is identical.

## Acceptance criteria

- [ ] The poll is a hook that returns the auction, the read error and nothing else.
- [ ] Each panel lives in its own file. `App.tsx` holds the layout and the configuration read.
- [ ] `short`, `formatUsdc`, `formatTime` and `explorerLink` keep their current home and signatures.
- [ ] `pnpm --filter @perdiem/ui typecheck` and `lint` pass.
- [ ] The page renders the same panels, in the same order, with the same fields.

## Comments
