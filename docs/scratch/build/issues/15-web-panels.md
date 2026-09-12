# Wire the five panels to the chain and the relay

Status: resolved Type: task Blocked by: 04, 07, 20

Intent, funding, bids, enclave, settlement. Every panel ends in a transaction hash.

The page reads the chain and the relay and nothing else. It never holds the policy or the enclave
private key, so no panel can show a price or a preference.

## Acceptance criteria

- [x] Five panels: intent, funding, bids, enclave, settlement.
- [x] Every panel shows a transaction hash, linked against the explorer base URL from
      verification 12.
- [x] Bids show commitment hashes and the size of each sealed bid at the relay, never a price.
- [x] The enclave panel never shows the preferences or the maximum price.
- [x] The page reads `auctions` and `commitments` and holds no auction state of its own.

## Comments

Two criteria moved to
[28 — Publish the losing bids after settlement](28-publish-the-losing-bids-after-settlement.md): the
full bids after `Finalized`, and the enclave log tail.

The relay gained `cors()` on `/auctions/*`. A browser on another origin could not read it.

## Dev review

`auctionOf` is the generated getter of the public `auctions` mapping. `commitmentsOf` is
`commitments`, and `committers`, `commitmentOf` and `hasCommitted` ship with it.
