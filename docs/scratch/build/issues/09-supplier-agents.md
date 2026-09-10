# Make the three supplier agents bid

Status: ready-for-agent Type: task Blocked by: 03, 04, 07, 08, 22

Read a real LiteAPI rate for the auction's public requirements, apply the rate plan, sign the bid,
then commit on chain with the Stake and post the sealed bid to the relay. One beat, both before the
bid deadline.

The rate plan tests in `agents/` state the three demo prices: 330, 400, 440.

Sign through the signer interface from ticket 22, never through a viem account directly. The demo
signs with Circle Agent Stack wallets, and an agent that reaches for a private key cannot.

## Acceptance criteria

- [ ] Each agent reads a real LiteAPI rate for the Public Requirements and applies its rate plan.
      The rate plan tests give 330, 400 and 440.
- [ ] One bid per agent, signed through the ticket 22 signer interface. No viem account is reachable
      from the bid flow.
- [ ] The commit lands with the Stake and the Sealed Bid lands at the relay, both before
      `bidDeadline`.
- [ ] The bid signer address and the committing address are identical, and a test states it.
- [ ] `auctionId` is read from `AuctionCreated` and never derived.
- [ ] A LiteAPI failure falls back to the fake client, so the flow still runs during the demo.

## Comments

## Dev review

Not reviewed yet.
