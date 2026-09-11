# Run the sealed bidding half end to end

Status: ready-for-agent Type: task Blocked by: 07, 09, 22, 23

`scripts/demo-sealed-bidding.sh` runs steps 1 to 5 of the flow and stops there. It proves the
privacy claim without the enclave: three commitments on chain, three ciphertexts at the relay, and
no readable bid anywhere.

Terminal output only. No page.

The cuts that make this runnable now, each one a ticket that stays open:

- The Policy is `referencePolicy` from `shared/reference-policy.ts`. No model call, so tickets 10
  and 21 stay out.
- The buyer is a plain viem account, not the Privy organization wallet. Ticket 11 stays out.
- The suppliers sign with `createLocalSigner`. The Circle half of ticket 22 stays out.
- Prices come from `createFakeLiteApiClient`. The sandbox client stays out.
- A local Hardhat node, not Arc testnet.

What it does not cover: scoring, settlement and the booking. Those are 05, 06, 13, 14.

## Acceptance criteria

- [ ] The script starts a Hardhat node, deploys with ticket 23, starts the relay, opens an auction
      with the `referencePolicy` hash, and runs the three agents.
- [ ] It exits non-zero on the first failed step, and prints one line per step with a transaction
      hash or an HTTP status.
- [ ] `commitments(auctionId)` returns three commitments. `GET /auctions/{auctionId}/bids` returns
      three ciphertexts.
- [ ] No step prints the Policy, the maximum price, the preferences, a salt or a decrypted bid.
- [ ] It runs twice in a row with no manual cleanup.

## Comments

## Dev review

Not reviewed yet.
