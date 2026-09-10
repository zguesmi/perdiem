# Wire the five panels to the chain and the relay

Status: ready-for-agent Type: task Blocked by: 04, 07, 20

Sizing is open: five panels across chain, relay and log sources is larger than one context window.

Intent, funding, bids, enclave, settlement. Every panel shows a transaction hash or a log line. Bids
show commitment hashes only until settlement, then the full bids, so the audience sees why the
cheapest one lost.

The enclave panel tails the simulation log and must never show the preferences.

## Acceptance criteria

- [ ] Five panels: intent, funding, bids, enclave, settlement.
- [ ] Every panel shows a transaction hash or a log line, linked against the explorer base URL from
      verification 12.
- [ ] Bids show commitment hashes only until `Finalized`, then the full bids and their scores, so
      the audience sees why the cheapest lost.
- [ ] The enclave panel never shows the preferences or the maximum price.
- [ ] The page reads `auctions` and `commitmentsOf` and holds no auction state of its own.

## Comments
