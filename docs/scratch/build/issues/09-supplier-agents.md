# Make the three supplier agents bid

Status: ready-for-agent Type: task Blocked by: 03, 04, 07, 08, 22, 26, 27

Each agent is a Claude tool-calling loop with two tools. An operator starts it with one sentence of
business rules. The model reads the auction terms, applies the rules, and submits one Bid. See
`docs/adr/0007-supplier-agents-decide-with-a-model.md`.

An agent never books. It seals its booking credentials into the envelope, per ticket 26, and the
Enclave books the winner. The agent's work ends at `bidDeadline`.

Delete `agents/src/rate-plan.ts` and `agents/test/rate-plan.test.ts`. The model prices now, and a
second pricing path nobody exercises is worse than none.

## Shape

```
agents/src/
  config.ts     zod schema and loader for agents/config/<name>.json
  watcher.ts    poll loop: eth_getLogs, AuctionCreated, one session per auction
  bidder.ts     the Anthropic tool runner and the system prompt
  tools.ts      getHotelId and submitBid, both deterministic Node
  lite-api/     unchanged
```

The watcher never calls the model. The model never sees a hash, a salt, a signature or a key.

## The two tools

`getHotelId(city)` returns real hotel identifiers, names and star levels from the LiteAPI sandbox.
The model picks one that matches its own star level. Any valid identifier is acceptable: the Enclave
books against it, so it has to exist, and nothing else about it is scored.

`submitBid(hotelId, hotelName, stars, price, refundable, breakfastIncluded, roomType, numberOfRooms)`
does the rest in Node, in one call: validate against `bidSchema`, check the price band, `bidHash`,
sign through the ticket 22 signer interface, draw a salt, `bidCommitment`, seal
`{bid, salt, signature, booking}` to the enclave public key, `commit` on chain with the Stake, and
`PUT` the ciphertext to the relay.

Those last four steps have one legal order, so they are one tool. Split into four, the model can
seal without committing, commit without posting, or commit twice.

## Configuration and secrets

`agents/config/<name>.json` is committed: `relayUrl`, `rpcUrl`, `sealedAuction`, `priceBand`,
`model`, `effort`.

The environment holds `ANTHROPIC_API_KEY`, the Circle session, and the `booking` credentials from
ticket 26. No key, account identifier or organization identifier reaches a committed file.

The star level, the refundable and breakfast policy and the rate card live in the prompt, not the
configuration. They are what an operator tells the agent.

## The prompt

One sentence per agent, passed at startup. The three demo prompts must produce 330, 400 and 440
against `referencePolicy`, so that the demo table in `docs/spec.md` holds unchanged.

```
You sell 3-star rooms in Paris. Room price is 330 USDC for 1 or 2 nights,
280 for 3 nights or more. In winter all prices drop to 240. Refundable,
no breakfast. Bid on requests.
```

Winter is December, January and February. Name the months in the system prompt; a model that guesses
the season is a model that drifts.

Nights are `checkout - checkin`. Season comes from the month of `checkin`. Both come from the
auction, not the prompt, which is the reasoning worth showing.

## Model settings

`claude-opus-5`, `thinking: {type: "adaptive"}`, `output_config: {effort: "low"}`. Picking a price
off a rate card is a small task. Both are overridable per agent in the configuration file.

The loop is `client.beta.messages.toolRunner`. Unverified: whether `betaZodTool` accepts zod 4
schemas, and the repository is on zod `^4.5.4`. Check that first and fall back to raw JSON schema
tools if it does not.

## Acceptance criteria

- [ ] Each agent runs a tool loop with exactly two tools, `getHotelId` and `submitBid`.
- [ ] The three demo prompts produce 330, 400 and 440 against `referencePolicy`.
- [ ] `submitBid` refuses a price outside the agent's `priceBand` and names the band in the error.
      The model corrects on the next turn.
- [ ] One bid per agent, signed through the ticket 22 signer interface. No viem account is reachable
      from the bid flow.
- [ ] The commit lands with the Stake and the Sealed Bid lands at the relay, both before
      `bidDeadline`.
- [ ] The bid signer address and the committing address are identical, and a test states it.
- [ ] `auctionId` is read from `AuctionCreated` and never derived.
- [ ] The envelope carries that agent's own booking credentials, and no code path books from the
      agent.
- [ ] A run stops after 12 model turns and exits non-zero.
- [ ] No log line and no error message carries `apiKey`, a salt, a signature or a decrypted bid. One
      test greps the agent output.
- [ ] `agents/src/rate-plan.ts` and `agents/test/rate-plan.test.ts` are gone.
- [ ] The tool tests run with no `ANTHROPIC_API_KEY`. Only the end-to-end agent test needs one.

## Comments

## Dev review

Not reviewed yet.
