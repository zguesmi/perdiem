# Run the enclave pipeline from the cron to the settlement

Status: ready-for-agent Type: task Blocked by: 29

Step 7 of `docs/spec.md` has no owner. Ticket 06 owns the scoring function, ticket 14 owns the
booking, ticket 13 captures the simulation evidence. Everything between the cron tick and
`writeReport` is this ticket, and nothing downstream runs without it.

`workflow-cre/src/workflow.ts` is still the template stub: it logs `enclave reached` and returns
`no auction pending`.

## The sequence

1. `pendingSettlement()`. On `bytes32(0)`, exit.
2. Write the claim report, `ACTION_CLAIM`, before any scoring work.
3. Read `auctions(auctionId)` for the Policy Hash, and `commitments(auctionId)` and
   `committers(auctionId)` for the commitment array.
4. Fetch the sealed Policy from the relay by Policy Hash, open it, and check
   `hashPolicy(policy) === policyHash`. Ticket 29 ships the envelope and the route.
5. `GET /auctions/{auctionId}/bids` through `cre.capabilities.HTTPClient`.
6. `openSealedBid` per envelope.
7. Check the signature: `ecrecover` first, then ERC-1271 `isValidSignature(bidDigest, signature)`
   against `0x1626ba7e` on the supplier address.
8. Check `bidCommitment(bidHash(bid), salt)` against `commitmentOf(auctionId, supplier)`.
9. `bidsRoot` over the commitment array as the chain holds it, every entry, including a committer
   whose ciphertext never arrived.
10. `settle(policy, bids)` from ticket 06.
11. Book the winner. Ticket 14 fills this seam in.
12. `encodeSettlementReport`, then `writeReport`. Two writes in one run, and the second sees the
    state the first committed: row V8.

## Traps

- Any failure at 6, 7 or 8 drops that bid and logs a count. Never a reason, never the bid.
- The Bids Root covers all on-chain commitments. Building it over the scored bids alone turns a good
  auction into a timeout refund.
- `EVMClient.callContract` is typed for `Runtime` and takes the `TeeRuntime` through a cast: row V2.
- The relay answers on `http://localhost:8787` in simulation: row V13.
- Nothing here may be logged: the Policy, the maximum price, the preferences, the enclave private
  key, a decrypted bid, a booking credential.

## Parallel with ticket 06

This ticket does not edit `workflow-cre/src/scoring.ts`. It calls `settle` through the signature the
stub already declares, and adapts `shared/bid.ts`'s `Bid` to the one scoring takes.

## Acceptance criteria

- [ ] The cron exits on `bytes32(0)` without a write.
- [ ] The claim report lands before any bid is fetched or opened.
- [ ] The Policy is fetched by Policy Hash, opened, and rejected when `hashPolicy` disagrees. A
      rejected Policy writes no settlement.
- [ ] A bid that fails decryption, the signature check or the commitment check is dropped, and the
      log carries a count and nothing else.
- [ ] A contract-account supplier passes through ERC-1271 and an EOA through `ecrecover`. One test
      each.
- [ ] The Bids Root is built from the chain's commitment array, and a committer with no ciphertext
      at the relay does not change it. One test states it.
- [ ] No eligible bid writes a settlement with `winner = address(0)`, `payout = 0` and an empty
      `bookingId`.
- [ ] The claim and the settlement both write in one run.
- [ ] The test output greps clean for the Policy, the maximum price, the preference numbers, the
      enclave private key, any decrypted bid and any booking credential.

## Comments

## Dev review

Not reviewed yet.
