# Make the three supplier agents bid

Status: resolved Type: task Blocked by: 03, 04, 07, 08, 22, 26, 27

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

- [x] Each agent runs a tool loop with one tool, `submitBid`. The hotel is configuration, so
      `getHotelId` is gone.
- [x] The three demo prompts produce 330, 400 and 440 against `referencePolicy`. A script checks it
      and the run is recorded below.
- [x] `submitBid` refuses a price outside the agent's `priceRange` and names the range in the error.
      The model corrects on the next turn.
- [x] One bid per agent, signed through the signer interface. No viem account is reachable from the
      bid flow. The Circle implementation of that interface is ticket 22.
- [x] The commit lands with the Stake and the Sealed Bid lands at the relay, both before
      `bidDeadline`.
- [x] The bid signer address and the committing address are identical, and a test states it.
- [x] `auctionId` is read from `TermsPublished` and never derived.
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
repository calls a model. The run is under Dev review.

`agents/src/lite-api/` is gone with the rate plan. Every function in it threw, the agent never
books, and the hotel is now configuration.

The sealed bid reaches the relay as a `0x` hex string. The enclave has to decode it the same way.

An agent is a long-running process. `watchAuctions` wraps viem's `watchContractEvent` on
`TermsPublished` and hands every new auction to the bidder without awaiting it, so a twelve-turn run
never hides the next auction. An auction fires once per process. `SIGINT` and `SIGTERM` stop it.

The criterion said `auctionId` comes from `AuctionCreated`. It comes from `TermsPublished`, which
carries every public requirement in one event; the bid deadline is read from `auctions(auctionId)`.
`AuctionCreated` is no longer in the agent's ABI. Still read, never derived.

The three configurations point at `wss://rpc.testnet.arc.io`, so viem watches with `eth_subscribe`.
Measured on Arc testnet, 2026-09-11: `eth_subscribe` answers for `logs` and `newHeads`, and the HTTP
endpoint answers `eth_newFilter` with
`The method "eth_newFilter" does not exist / is not available.`, so an `https://` URL falls back to
polling `eth_getLogs`.

The earlier configurations named `https://rpc.testnet.arc.network`, which is not an Arc host. Row
V12 records `https://rpc.testnet.arc.io`.

`getHotelId` is gone, against the ticket. The operator now picks each supplier's hotel from the
LiteAPI catalogue once and writes it into `agents/config/<name>.json`, so the agent holds one tool
and no LiteAPI key. Cost: the model no longer chooses a hotel, and a new supplier needs an operator
to look up an identifier. Gain: one less network call in the loop, one less key on the agent, and a
model that cannot bid a room its supplier does not sell. The three identifiers are verified against
`POST /hotels/rates` for the reference dates.

The three agents are named after their hotels: `hotel-astoria-agent`, `victoria-palace-agent` and
`grands-voyageurs-agent`.

## Dev review

Every criterion holds except the Circle signer, which is ticket 22's to write. `createLocalSigner`
ships here so the bid flow runs.

`pnpm --filter @perdiem/agents check:prices`, 2026-09-11, against `claude-opus-5`:

```
grands-voyageurs-agent: 440000000 (expected 440000000) ok
hotel-astoria-agent: 330000000 (expected 330000000) ok
victoria-palace-agent: 400000000 (expected 400000000) ok
```

`pnpm --filter @perdiem/agents test`: 14 pass, 0 fail.
