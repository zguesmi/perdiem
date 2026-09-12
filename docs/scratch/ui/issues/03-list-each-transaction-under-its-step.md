# List each transaction under its step

Status: ready-for-agent Type: task Blocked by: 02

Transaction hashes sit at the bottom of five panels, so no reader can see the auction as a sequence
of on-chain writes. The stepper is where that sequence belongs.

Each step lists the transactions that produced it, in block order, as they land:

- Created: `createAuction`, and `TermsPublished` when it is a separate transaction.
- Bidding: one row per `commit`, newest last, with the supplier address.
- Settling: the claim.
- Finalized: the settlement. Timeout: the refund.

A row shows the block number, a short hash and a link to the explorer. Without
`VITE_EXPLORER_URL` the hash renders as plain text.

A new transaction appears within one poll, with no reload and no page jump.

## Acceptance criteria

- [ ] Every transaction the page knows about appears under exactly one step, in block order.
- [ ] Each row shows the block number and links to the explorer when one is configured.
- [ ] A commit that lands during the demo appears within one poll interval.
- [ ] A step with no transaction yet says so in one short line.
- [ ] The transaction hashes the panels used to show are gone from the panels.

## Comments
