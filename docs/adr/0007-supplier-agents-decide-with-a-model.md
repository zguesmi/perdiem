# Supplier agents decide with a model

The three supplier agents were deterministic. A rate plan held a margin, `priceFromRatePlan` applied
that margin to a live rate, and the price followed. The agent chose nothing.

They now run a Claude tool-calling loop. An operator starts each agent with one sentence of business
rules. The model reads the auction terms, applies the rules, and submits one Bid.

```
You sell 3-star rooms in Paris. Room price is 300 USDC for 1 or 2 nights,
250 for 3 nights or more. In winter all prices drop to 200. Refundable,
no breakfast. Bid on requests.
```

That prompt needs three decisions the model must derive from the auction, not from the prompt:
nights from `checkout - checkin`, season from the month of `checkin`, and a hotel that matches its
own star level.

## What the model decides

The model holds two tools.

| Tool                | What it does                                                      |
| ------------------- | ----------------------------------------------------------------- |
| `getHotelId(city)`  | Returns real hotel identifiers and names from the LiteAPI sandbox |
| `submitBid(fields)` | Builds, signs, seals, commits and posts one Bid                   |

`submitBid` runs entirely in Node. It validates the fields, hashes the Bid with EIP-712, signs
through the signer interface, draws a salt, computes the Bid Commitment, seals the envelope, commits
on chain with the Stake, and posts to the relay.

The model never sees a hash, a salt, a signature or a private key. A model that wrote its own
hashing would produce a commitment the Enclave drops, and the drop is silent: scoring logs counts,
not reasons.

So the model chooses the hotel, the price and the attributes. Nothing else.

## Rejected

**One call that returns a price.** A single request returns
`{price, stars, refundable, breakfastIncluded}` against a strict schema, and fixed Node code does
the rest in a fixed order. Cheapest and most reliable. Rejected because the agent is then a pricing
function with a prompt, and the tool loop is the part worth building.

**Full autonomy over the filesystem.** The model reads `shared/bid.ts` and `shared/sealed-bid.ts`
itself and writes its own calls through a bash tool. Rejected on byte-exactness: EIP-712
`hashStruct`, the canonical encoding and the X25519 envelope have one correct output each, and a
model that re-derives them each run is not reproducible.

## The price band

The demo result is a knife edge. Against the reference Policy, Agent A stays Ineligible only while
its price is above 280: at 280 it clears the 30% Trade-Down against B's 400, becomes Eligible, and
scores 290 against C's 170. The cheapest bid would then win, which is the opposite of the claim.
Agent C must stay below 490 or it ties B and loses on price.

So each agent's configuration carries a `priceBand`. `submitBid` refuses a price outside it and
names the band in the error. The model corrects on the next turn. The band is configuration, not a
hidden rule, and one test asserts each agent lands inside its own.

A silent clamp was rejected. It always terminates and never costs a turn, but the model then
believes it bid a price it did not bid.

## Limitations

The price is prompt-derived, not market-derived. The old agents read a live rate and applied a
margin, so the price tracked the market. The new agents read a rate card from their own prompt.
LiteAPI still supplies a real hotel identifier, and the Enclave still books against it, but the
number is the supplier's own list price. The claim is "three agents priced one request by their own
published rules", not "three agents priced against the market".

There is no fallback. `agents/src/rate-plan.ts` and its tests are deleted, so the model is the only
pricing path. An Anthropic API outage means no bid at all. Cost of keeping a second path: two code
paths for one decision, and a fallback nobody exercises.

Every bid costs tokens and a round trip. A deterministic agent bid in milliseconds for nothing.

A model can decline or drift. The band catches a bad price. Nothing catches a model that reasons its
way to a bid the operator did not intend, beyond the turn cap and a non-zero exit.
