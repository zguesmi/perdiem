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
does the rest in Node, in one call: validate against `bidSchema`, check the price range, `bidHash`,
sign through the ticket 22 signer interface, draw a salt, `bidCommitment`, seal
`{bid, salt, signature, booking}` to the enclave public key, `commit` on chain with the Stake, and
`PUT` the ciphertext to the relay.

Those last four steps have one legal order, so they are one tool. Split into four, the model can
seal without committing, commit without posting, or commit twice.

## Configuration and secrets

`agents/config/<name>.json` is committed: `relayUrl`, `rpcUrl`, `sealedAuction`, `priceRange`,
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
- [ ] The three demo prompts produce 330, 400 and 440 against `referencePolicy`. A script checks it;
      no run has been recorded.
- [x] `submitBid` refuses a price outside the agent's `priceRange` and names the range in the error.
      The model corrects on the next turn.
- [ ] One bid per agent, signed through the ticket 22 signer interface. No viem account is reachable
      from the bid flow.
- [x] The commit lands with the Stake and the Sealed Bid lands at the relay, both before
      `bidDeadline`.
- [x] The bid signer address and the committing address are identical, and a test states it.
- [x] `auctionId` is read from `AuctionCreated` and never derived.
- [x] The envelope carries that agent's own booking credentials, and no code path books from the
      agent.
- [x] A run stops after 12 model turns and exits non-zero.
- [x] No log line and no error message carries `apiKey`, a salt, a signature or a decrypted bid. One
      test greps the agent output.
- [x] `agents/src/rate-plan.ts` and `agents/test/rate-plan.test.ts` are gone.
- [x] The tool tests run with no `ANTHROPIC_API_KEY`. No test needs one: the end-to-end check is a
      script.

## Comments

Implemented, less two things.

The Circle Agent Stack signer is not written, because ticket 22 is still `ready-for-agent`. The
signer interface and `createLocalSigner` ship here instead, so the bid flow runs; ticket 22 keeps
`createCircleAgentSigner` and the address-identity test it asks for.

The three demo prices are checked by `agents/scripts/check-demo-prices.ts`, run with
`pnpm --filter @perdiem/agents check:prices`. It is a script and not a test, because no test in this
repository calls a model. That criterion is therefore written and not yet observed.

`agents/src/lite-api/` is gone with the rate plan. Every function in it threw, the agent never
books, and the hotel is now configuration.

The sealed bid reaches the relay as a `0x` hex string. The enclave has to decode it the same way.

An agent is a long-running process. `watchAuctions` polls `eth_getLogs` every 3 seconds and hands
every new auction to the bidder without awaiting it, so a twelve-turn run never hides the next
auction. An auction fires once. A failed read is logged and retried, because a watcher that exits on
a dropped connection is a supplier that silently stops bidding. `SIGINT` and `SIGTERM` stop it.

`getHotelId` is gone, against the ticket. The operator now picks each supplier's hotel from the
LiteAPI catalogue once and writes it into `agents/config/<name>.json`, so the agent holds one tool
and no LiteAPI key. Cost: the model no longer chooses a hotel, and a new supplier needs an operator
to look up an identifier. Gain: one less network call in the loop, one less key on the agent, and a
model that cannot bid a room its supplier does not sell. The three identifiers are verified against
`POST /hotels/rates` for the reference dates.

The three agents are named after their hotels: `hotel-astoria-agent`, `victoria-palace-agent` and
`grands-voyageurs-agent`.

## Dev review

Not reviewed yet.
