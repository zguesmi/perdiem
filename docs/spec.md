# SPEC — Perdiem: confidential hotel booking with a private buyer policy

The live specification. `docs/initial-spec.md` is the frozen original, kept as the record of the idea
as it was at the beginning; every decision that changed it is in `docs/grilling-session.md`.

Vocabulary is defined once, in `CONTEXT.md`, and used here without redefinition.

## Pitch

A corporate travel desk states a booking need in one English sentence. An LLM turns the sentence into
a Policy: hard requirements, weighted preferences, and a maximum price. The buyer confirms the Policy
once. Its hash is committed on chain before any Bid exists. The buyer locks a Budget in Escrow on
Arc. The Policy is sealed inside a Chainlink CRE confidential workflow. Hotel supplier agents each
submit one Sealed Bid. The Enclave scores them against the private Policy and reports only the winner
and the payout. The contract pays the winner, refunds the remainder, and holds the winner's Stake
until a booking receipt arrives.

The money shot: three bids arrive. The cheapest one loses. The second cheapest wins. The buyer pays
more than the cheapest on purpose, for what the private Policy values.

Tagline: "Commit the policy. Score in the enclave. The chain pays."

## Goals and non-goals

Goals, all required for the demo:

1. Policy Hash committed on chain before bidding opens. Verifiable by block order.
2. Policy processed only inside the confidential handler. Never on the workflow nodes.
3. Sealed, single-shot bids. No supplier sees another's Bid before scoring.
4. Settlement enforced by contract: Payout never exceeds Budget, Payout only to the reported winner,
   and the Settlement bound to the committed Policy Hash and to the on-chain Bid Commitments.
5. The winner delivers a real LiteAPI sandbox booking and posts a Receipt. Stake slashed on silence.
6. Buyer funding goes through a Privy organization wallet with a spend policy and a key quorum above
   a ceiling.
7. A working page, a working backend, an architecture diagram, a README and a two-minute video.

Non-goals, deliberately cut:

- Multiple buyers. One buyer, one workflow.
- Reputation, supplier identity registry, ENS, The Graph.
- Second-price or Vickrey pricing. First price only.
- Iterative bidding or score feedback.
- Production key management. Demo keys in `.env`.
- Real personal data. LiteAPI sandbox test guests only.
- Mainnet anything.

## Architecture

| Directory | What it is |
| --- | --- |
| `onchain/` | `SealedAuction.sol` on Arc testnet, chain id 5042002 pending `docs/scratch/verification/issues/12`. Hardhat 3, solc 0.8.34 |
| `workflow/` | The Chainlink CRE workflow. Scoring runs inside `handlerInTee` |
| `agents/` | Three supplier agents. One wraps the LiteAPI sandbox |
| `requisition/` | The buyer's service: intent parsing, policy commit, Privy funding |
| `relay/` | A blind store for Sealed Bids. Holds ciphertext, serves the Enclave |
| `web/` | One page, five panels |
| `packages/core` | Types, schemas, canonical JSON, hashing. Shared by everything except scoring |

### Flow

1. The buyer types one sentence. `requisition/` makes one LLM call and returns a Policy, validated
   against its schema. Invalid output is rejected, with one retry at most.
2. The buyer confirms. `requisition/` canonicalizes the Policy and computes the Policy Hash.
3. `requisition/` uploads the Policy and the enclave private key as workflow secrets, then calls
   `createAuction`. The Budget is pulled in the same call, so the auction is funded the moment it
   exists.
4. Privy signs that call from the organization wallet. Above the ceiling, the key quorum approves.
5. State is `Created`. Public: the Public Requirements and the enclave public key. Private: the
   preferences, the Trade-Down discount, and the maximum price.
6. Each agent builds one Bid, signs it with EIP-712, and in one beat commits
   `keccak256(abi.encode(bidHash, salt))` on chain with its Stake and posts the Sealed Bid to the relay.
   Both before `bidDeadline`. The first commit moves the auction to `Bidding`.
7. There is no reveal phase. See `docs/adr/0001-no-reveal-phase.md`.
8. After `bidDeadline` the workflow claims the auction with `startSettling`, then the Enclave fetches
   the Sealed Bids, decrypts them, checks each signature and each commitment, filters for Eligible,
   scores, picks a winner, and rebuilds the Bids Root.
9. Only the Settlement leaves the Enclave. The workflow writes it to `SealedAuction`.
10. The contract checks the Policy Hash, the Bids Root, and that the Payout fits the Budget. It pays
    the winner, refunds the buyer, refunds the losing Stakes, and moves to `Finalized`.
11. The winner books through LiteAPI and posts the Receipt, which releases its Stake.
12. No Receipt by `deliverDeadline` and anyone may slash the Stake to the buyer.

## Data schemas

### Policy

Private. Only its hash reaches the chain.

This is the settled schema, closed by
`docs/scratch/build/issues/01-policy-schema-and-scoring-formula.md`. Code may be written against it.
Changing a field name, a unit or a number here changes every Policy Hash, so a change means a new
`version` and a regenerated hash fixture.

```json
{
  "version": 1,
  "currency": "USDC",
  "maxPrice": 520000000,
  "nights": 2,
  "hardRequirements": {
    "city": "Paris",
    "checkin": "2026-10-12",
    "checkout": "2026-10-14",
    "minStars": 4,
    "roomType": "double",
    "numberOfRooms": 1,
    "location": {
      "name": "Gare du Nord",
      "latitudeMicro": 48880900,
      "longitudeMicro": 2355300
    },
    "radiusMeters": 2000
  },
  "tradeDown": {
    "stars": 3,
    "requiredDiscountPercentage": 30
  },
  "preferences": {
    "refundable": 50000000,
    "breakfastIncluded": 40000000
  }
}
```

Every number above is an integer. No field in a Policy or a Bid is ever a fraction, because a
fraction has more than one shortest decimal form in some encoders and two encoders that disagree by
one digit produce two different Policy Hashes, which kills the auction. So money is minor units,
distance is metres, and coordinates are microdegrees.

The example is written at 6 decimals. The real decimal count comes from
`docs/scratch/verification/issues/05-arc-usdc-address-and-decimals.md` and lives in exactly one
constant in `packages/core`. If it turns out to be 18, only the fixture is regenerated; no rule and no
formula changes, because every comparison in scoring is between two amounts in the same unit.

Rules:

- Every amount is an integer in USDC minor units. The conversion from what the buyer typed happens
  once, in the requisition service, before the buyer confirms. Nothing downstream converts anything.
- A Preference Bonus is a flat number, not a rate. The requisition service converts what the buyer
  says — "12% more", "20 a night" — into what it is worth on this trip, before the buyer confirms.
  The buyer confirms concrete numbers, not a formula. What this loses: a refundable bonus no longer
  scales with the bid price.
- `version` and `currency` are inside the hash and are read by nothing during scoring. `version`
  makes a schema change a different hash instead of a silent reinterpretation. `currency` makes a
  future non-USDC Policy hash differently from today's.
- `nights` is inside the hash and is read by nothing during scoring either. It is the divisor the
  requisition service used to turn "20 a night" into a flat bonus, kept so that the Policy revealed
  after settlement explains its own numbers.
- Canonical encoding is RFC 8785 JSON Canonicalization Scheme, restricted to integers: no fractional
  numbers, no exponents, no `null`, no absent-versus-undefined ambiguity. One function, in
  `packages/core`, used by the requisition service and the Enclave, with a golden fixture both sides
  assert against. See `docs/adr/0003-canonical-encoding.md`.

Public Requirements, emitted in `AuctionCreated`: city, checkin, checkout, minStars, roomType,
numberOfRooms, location, radiusMeters, and `tradeDown.stars`.

Never emitted: `maxPrice`, `tradeDown.requiredDiscountPercentage`, `preferences`.

### Budget and the maximum price are different numbers

The Budget is pulled by a public `transferFrom`, so anyone watching the chain sees it. If the Budget
equalled the maximum price, the ceiling would be public and a supplier could price one unit under it.

So the Budget is padded above the maximum price. In the demo: Budget 750, maximum price 520, Payout
440, refund 310.

This is a workaround, not a fix. The ceiling is still bounded from above by what anyone can see.

### Auction identity and the signing domain

`auctionId` is a monotonic counter cast to `bytes32`: the first auction is `0x00…01`. A counter is
enough because a Bid signature is domain-separated, so a signature made for auction 1 on one
deployment cannot be replayed against auction 1 on another.

The EIP-712 domain is fixed for a deployment:

```
name              "Perdiem"
version           "1"
chainId           the Arc testnet chain id
verifyingContract the SealedAuction address
```

Suppliers do not derive `auctionId`. They read it from `AuctionCreated`.

### Bid

Signed by the supplier with EIP-712.

```json
{
  "auctionId": "0x…",
  "supplier": "0x…",
  "hotelId": "lp1a2b3",
  "hotelName": "Awesome Hotel",
  "stars": 4,
  "distanceMeters": 1000,
  "price": 440000000,
  "refundable": true,
  "breakfastIncluded": true,
  "roomType": "double",
  "numberOfRooms": 1,
  "salt": "0x…32 bytes"
}
```

The EIP-712 type is:

```
Bid(bytes32 auctionId,address supplier,string hotelId,string hotelName,uint8 stars,
    uint32 distanceMeters,uint256 price,bool refundable,bool breakfastIncluded,
    string roomType,uint8 numberOfRooms)
```

Three hashes, and the difference between them matters, because getting them the wrong way round is
how honest bids get dropped:

- `bidHash` is the EIP-712 `hashStruct` of the type above. No salt, no domain.
- The signature is over `keccak256(0x1901 ‖ domainSeparator ‖ bidHash)`.
- The Bid Commitment is `keccak256(abi.encode(bidHash, salt))`.

The salt stays out of the struct hash, so the signature can be checked without it, and the
commitment cannot be brute-forced with it.

`hotelName` is signed and never scored. It exists so that the page can name the winner without a
second lookup.

### What a Bid is not

The Enclave checks that a Bid was signed by the address that staked, and that it matches the
commitment placed before the deadline. It does not check that the Bid is true. `stars`,
`distanceMeters`, `refundable` and `breakfastIncluded` are self-attested by the supplier, and no
oracle contradicts them.

So the guarantee is narrower than "the best hotel wins". It is: the buyer's rule stayed private, the
bids were sealed and single-shot, and the payout went to the supplier that claimed the best fit
against that rule. A supplier that lies wins the auction and then has to produce a booking Receipt
for what it claimed, or lose its Stake. That is the only enforcement, and it is deliberate. See
`docs/adr/0004-bid-attributes-are-self-attested.md`.

The demo agents price from real LiteAPI sandbox rates, so the numbers on screen are real even though
nothing in the protocol requires them to be.

### Sealed Bid

The relay must never hold a readable Bid, because a readable Bid also leaks the salt, and a leaked
salt unseals the commitment: the bid space is small enough — an integer price in a narrow band, a
few booleans, a handful of star values — that keccak256 brute-forces in seconds without it.

- **Key**: one X25519 keypair per deployment. The private half is a workflow secret, loaded only
  inside `handlerInTee`, exactly like the Policy. The public half is a `createAuction` argument and
  is emitted in `AuctionCreated`.
- **Envelope**: the agent seals `{bid, salt, signature}` to that public key. The salt goes inside the
  ciphertext. Nothing but the ciphertext and the supplier address leaves the agent.
- **Relay**: one blob per auction and supplier, size-capped. Write-only token for agents, read token
  for the workflow. It cannot verify a signature, so it cannot filter spam beyond one blob per
  supplier. The Enclave drops whatever fails.
- **Enclave**: loads the private key, decrypts, checks the EIP-712 signature, then checks the
  commitment. Any failure drops that bid, and only a count is logged.

A relay leak costs an attacker nothing readable. It still allows dropping a blob, and that is what
the Bids Root catches.

Known limitation: today `requisition/` generates the keypair, so the buyer holds the private half and
could decrypt every Sealed Bid. Suppliers are protected from each other, not from the buyer. See
`docs/scratch/build/issues/16-enclave-key-generation.md`.

### The relay interface

Two static bearer tokens from the environment, one write and one read. The relay stores bytes and
nothing else: it parses no ciphertext, knows no deadline, and holds no auction state.

| Call | Token | Behaviour |
| --- | --- | --- |
| `PUT /auctions/{auctionId}/bids/{supplier}` | write | Body is the raw ciphertext, at most 16 KiB. `201` on the first write for that pair, `409` on any later one |
| `GET /auctions/{auctionId}/bids` | read | `200` with `[{ supplier, ciphertext }]`, ascending by supplier address. `[]` for an unknown auction |

Rules the tests state:

- A write token on the `GET` is `403`, not `404`. A supplier must not be able to read a rival's blob,
  and must not be able to learn whether one exists.
- A read token on the `PUT` is `403`.
- Over the size cap is `413`.
- First write wins. A supplier that posts the wrong blob cannot replace it, because its commitment is
  already on chain and unchangeable; letting it overwrite would only let it swap the bid behind a
  fixed commitment, which the Enclave would then drop anyway.
- No delete, no auction listing, no enumeration of suppliers by anyone holding the write token.

### Settlement

```solidity
struct Settlement {
  bytes32 auctionId;
  address winner;
  uint256 payout;      // USDC minor units, first price
  bytes32 policyHash;
  bytes32 bidsRoot;    // see below: keccak256 over the sorted bid commitments
}
```

No Eligible bid means `winner = address(0)` and `payout = 0`. The contract refunds the Budget and
every Stake.

The Bids Root binds the Settlement to the exact set of on-chain commitments, so no bid can be dropped
or swapped between the chain and the Enclave. It only means that if the **Enclave** builds it:

- Preferred: the Enclave reads the commitments from the chain itself and hashes the sorted set.
- Fallback: the workflow passes them in, the Enclave checks that every Sealed Bid it scored is present
  in that set, and hashes it. The guarantee degrades to "the same lie was not fed to both the Enclave
  and the contract".

Which path applies is `docs/scratch/verification/issues/02-enclave-chain-read-and-confidential-http.md`.

The construction is exact, because the contract recomputes it and a one-byte difference rejects a
correct settlement:

```
bidsRoot = keccak256(abi.encodePacked(sorted))   // sorted: every commitment for the auction,
                                                 // ascending as unsigned 32-byte big-endian
bidsRoot = bytes32(0)                            // when there are no commitments at all
```

Duplicates cannot occur, because `commit` is once per address. The contract stores commitments in
arrival order and sorts a memory copy when it verifies, which is an insertion sort over a handful of
entries.

Either way the root covers **all** on-chain commitments, including any committer whose Sealed Bid
never arrived or failed to decrypt. Build it over only the scored bids and one missing blob turns a
good auction into a timeout refund.

### Receipt

`keccak256(bytes(liteApiBookingId))`. The page shows the plain booking id and the sandbox response
beside the on-chain hash.

## Scoring

Inside the Enclave. Deterministic integer arithmetic.

1. Decrypt, check the EIP-712 signature, then check the commitment against the chain. Drop any
   failure; log counts only.
2. Eligibility, per bid:
   - city, checkin and checkout equal the hard requirements.
   - roomType and numberOfRooms equal the hard requirements.
   - `distanceMeters <= radiusMeters`.
   - `price <= maxPrice`.
   - `stars >= minStars`, **or** the Trade-Down applies: `stars == tradeDown.stars` and
     `price * 100 <= cheapestEligibleAtMinStars * (100 - tradeDown.requiredDiscountPercentage)`.
     Compute `cheapestEligibleAtMinStars` first, over bids that pass every other check with
     `stars >= minStars`. If there is no such bid, a trade-down bid is Eligible on `price <= maxPrice`
     alone.
3. Score, per Eligible bid:
   - `bonus = 0`
   - if `refundable`: `bonus += preferences.refundable`
   - if `breakfastIncluded`: `bonus += preferences.breakfastIncluded`
   - `score = (maxPrice - price) + bonus`
4. The winner is the highest score. Ties break on lower price, then lower supplier address.
5. `payout = winner.price`.

`maxPrice` is identical for every bid, so it cannot change the ranking. It stays in the formula
because it makes scores positive and readable during the demo.

### The demo table

All bids are one double room, two nights. Budget 750, maximum price 520, `refundable` 50,
`breakfastIncluded` 40. Whole USDC here for reading; the test carries the same figures in minor
units.

| Bid | Stars | Distance | Price | Refundable | Breakfast | Result |
| --- | --- | --- | --- | --- | --- | --- |
| A | 3 | 500 m | 330 | yes | no | Ineligible. 330 is 17.5% under the cheapest four-star bid; the Trade-Down asks for 30% |
| B | 4 | 700 m | 400 | no | no | Score 120 |
| C | 4 | 1000 m | 440 | yes | yes | Score 80 + 50 + 40 = **170. Wins** |

Payout 440, refund 310. A and B get their Stakes back at settlement; C's is released on the Receipt.

This table is a test in `workflow/`, and it is red until scoring is implemented.

### Every USDC in and out

Nine hundred USDC enters escrow: the 750 Budget from the buyer and three 50 Stakes. Every terminal
path returns exactly that, and each row is a contract test.

| Path | Out |
| --- | --- |
| Winner, Receipt posted | 440 winner, 310 buyer, 100 losing Stakes, 50 winner Stake |
| Winner, silence, then slashed | 440 winner, 310 buyer, 100 losing Stakes, 50 Stake to buyer |
| No Eligible bid | 750 buyer, 150 Stakes |
| Timeout from `Bidding` or `Settling` | 750 buyer, 150 Stakes |
| No commit before `bidDeadline`, then timeout | 750 buyer, nothing else entered |

## Contract

`onchain/contracts/SealedAuction.sol`. The contract plays the Escrow role while it holds the Budget
and the Stakes.

### States

```
Created   → funded at creation, no commit yet
Bidding   → commitments on chain and sealed bids at the relay, both until bidDeadline
Settling  → the workflow has claimed the auction and is scoring it
Finalized → terminal, with or without a winner
Timeout   → terminal, everything refunded
```

- `Created → Bidding` on the first commit. No extra transaction.
- `Bidding` has one deadline. The commit and the sealed post both happen before it, in either order.
  The contract never sees the post.
- `Bidding → Settling` is driven by the workflow calling `startSettling`, not by the clock. A
  time-based flip cannot distinguish "the workflow never ran" from "the workflow ran and its
  settlement was rejected". With an explicit claim, `Bidding` past the deadline means the workflow
  never picked it up, and `Settling` means it did. During a demo that is the difference between
  debugging the relay and debugging the settlement. It costs one extra write.
- `Settling → Finalized` on a valid settlement, with or without a winner.
- Either state `→ Timeout` through `timeoutRefund`, once past `finalizeDeadline`.
- Delivery is not a state. After `Finalized`, `receiptHash`, `stakeReleased` and `stakeSlashed` are
  fields on the auction.

`finalizeDeadline` exists to stop a race. If refunds opened at `bidDeadline`, any losing bidder could
kill the auction a second later, before the Enclave ever ran. The gap has to cover the cron interval,
the claim, scoring and the settlement write: a few minutes.

Demo values, all passed to `createAuction`, none of them constants in the contract:

```
bidDeadline       creation + 90 seconds
finalizeDeadline  bidDeadline + 180 seconds
deliverDeadline   finalizeDeadline + 600 seconds
```

### Functions

- `createAuction(policyHash, publicRequirements, enclavePublicKey, bidDeadline, finalizeDeadline,
  deliverDeadline, budget) → auctionId` — buyer only. Requires
  `block.timestamp < bidDeadline < finalizeDeadline < deliverDeadline`, so no auction can exist that
  is undeliverable or unslashable. Pulls the Budget. Records the block number. Emits
  `AuctionCreated`.
- `commit(auctionId, commitment)` — any address, once, before `bidDeadline`. Pulls the `STAKE`
  constant, 50 USDC. Emits `Committed`.
- `startSettling(auctionId)` — the CRE forwarder only. Requires `Bidding` and
  `block.timestamp >= bidDeadline`.
- `onReport(bytes metadata, bytes report)` — the CRE forwarder only, through the Chainlink receiver
  template. This name belongs to Chainlink and is kept verbatim; everywhere else the word is
  "settlement". Requires `Settling`, a matching Policy Hash, a matching Bids Root, a Payout within the
  Budget, and a winner that either committed or is the zero address. Pays, refunds, moves to
  `Finalized`.
- `submitReceipt(auctionId, receiptHash)` — the winner only, before `deliverDeadline`. Releases its
  Stake.
- `slash(auctionId)` — anyone, after `deliverDeadline` with no Receipt. The Stake goes to the buyer.
- `timeoutRefund(auctionId)` — anyone, from `Bidding` or `Settling`, after `finalizeDeadline` with no
  settlement. Refunds the Budget and every Stake. This is a liveness escape hatch, and it is
  documented as one.

Three views, because the workflow has no state of its own and has to ask:

- `pendingSettlement() → bytes32` — the lowest `auctionId` in `Bidding` with
  `block.timestamp >= bidDeadline`, or `bytes32(0)` when there is none. This is what the cron reads.
- `commitmentsOf(auctionId) → bytes32[]` — arrival order. The Bids Root is built from this set.
- `auctionOf(auctionId) → Auction` — state, buyer, deadlines, Policy Hash, enclave public key,
  Budget, winner, Payout, `receiptHash`, `stakeReleased`, `stakeSlashed`. One call for the page and
  one for the workflow.

### Invariants

- USDC out never exceeds USDC in, per auction.
- No payout unless the Policy Hash and the Bids Root both match.
- The buyer cannot withdraw between `createAuction` and `Finalized`, except through `timeoutRefund`.
- `Finalized` and `Timeout` are terminal.

### Tests

The demo table end to end; a wrong Policy Hash rejected; a wrong Bids Root rejected; `startSettling`
from a non-forwarder rejected; a settlement before `startSettling` rejected; `timeoutRefund` before
`finalizeDeadline` rejected; deadlines out of order rejected at creation; the no-winner path; the
slash path; the timeout path.

The USDC address and its decimals are
`docs/scratch/verification/issues/05-arc-usdc-address-and-decimals.md`. Arc's native gas is USDC with 18
decimals and the ERC-20 used for escrow may differ, so nothing hardcodes 6.

## CRE workflow

- Start from `cre init --template=hello-confidential-workflows-ts`.
- A cron trigger, every 60 seconds in simulation, calls `pendingSettlement()`. On `bytes32(0)`, exit.
- Claim it with `startSettling` before doing any scoring work.
- Read the commitments and pass them into the confidential handler. The workflow nodes do not compute
  the Bids Root.
- Inside `handlerInTee`: load the Policy and the enclave private key from secrets; fetch the Sealed
  Bids from the relay with the read token; decrypt; check signatures; check commitments; build the
  Bids Root; score; return only the Settlement.
- Encode the Settlement and write it to `SealedAuction`.
- Save one full `cre workflow simulate` run to `docs/evidence/`.

Never logged, anywhere outside the enclave section: the Policy, the maximum price, the preferences,
the enclave private key, any decrypted Bid. Grep the logs before committing them.

Whether one run can issue two writes is
`docs/scratch/verification/issues/08-two-writes-per-workflow-run.md`. If it cannot, the claim and the
settlement go on separate cron ticks and the interval drops to 20 seconds.

## Supplier agents

Three processes, one codebase, three rate plans: hotel, stars, distance, base price, refundable,
breakfast, margin.

- On start, call the LiteAPI sandbox for the Public Requirements and pick a real hotel and a real rate
  as the base price. Then apply the rate plan. That is the decision logic tied to a real signal.
- Build one Bid, sign it, then commit with the Stake and post the Sealed Bid. One beat, both before
  `bidDeadline`.
- On winning: prebook, book with the sandbox payment method, then post the Receipt.
- Agents never read the relay. They hold write-only tokens; the workflow holds the read token.

## Requisition service

- `POST /intent` — one LLM call with a fixed system prompt, stored at `docs/ai/intent-prompt.md`, and
  validation against the Policy schema. One retry, then it fails.
- `POST /confirm` — canonicalize, hash, upload the workflow secrets, call `createAuction` with the
  Budget.
- Privy: the organization wallet signs. Its policy allows USDC transfers to `SealedAuction` and
  nothing else. Above the ceiling, a key quorum of two signs: travel manager and finance. Both
  approvals show on the page.
- The ceiling is 500 USDC. The demo Budget is 750, so the quorum fires on camera every time rather
  than being described. A Budget under 500 goes through on the policy alone, which is the path the
  tests use when they are not exercising the quorum.

## The page

One page, five panels, top to bottom. Every panel shows a transaction hash or a log line.

1. **Intent** — the sentence, the parsed Policy, then the Policy Hash, its transaction and its block.
2. **Funding** — Budget, ceiling, Privy approvals, the `createAuction` transaction.
3. **Bids** — commitment hashes only until settlement, then every bid with its price and attributes,
   so the audience sees why the cheapest lost.
4. **Enclave** — a live tail of the simulation log. The preferences never appear.
5. **Settlement** — winner, Payout, refund, Stake refunds, Receipt, LiteAPI response.

No design work beyond a clean default. No mobile layout.

## Demo, two minutes

- 0:00 The sentence.
- 0:15 The Policy, confirmed, committed. "Committed before any bid exists."
- 0:30 Privy funding with the quorum. "A human before anything irreversible."
- 0:45 Three commitments on chain, three sealed blobs at the relay. Hashes and ciphertext only.
- 0:55 The simulation log: policy loaded in the enclave, three sealed bids decrypted and verified,
  scoring done. "The relay never saw a price."
- 1:10 The settlement. C wins at 440, refund 310. "The cheapest lost. The second cheapest won."
- 1:25 The three bids, and why: A failed the trade-down rule, B lost on cancellation and breakfast.
- 1:40 The winner books in the sandbox. Receipt on chain. Stake released.
- 1:50 "Name Your Own Price had one dimension and the platform saw the bid. Here the scoring rule is
  private from the platform too."
- 2:00 End card.

## What is verified, and what is open

Verified facts live in `docs/decisions.md`. Open questions are tickets in `docs/scratch/verification/`,
and the build tickets that depend on them carry a `Blocked by:` line. Nothing gets written against an
open row.

## Links

- Confidential Workflows: https://docs.chain.link/cre/concepts/confidential-workflows
- Using confidential workflows: https://docs.chain.link/cre/guides/workflow/using-confidential-workflows
- CRE supported networks: https://docs.chain.link/cre/supported-networks-ts
- The template: https://docs.chain.link/cre-templates/hello-confidential-workflows
- Connect to Arc: https://docs.arc.io/arc/references/connect-to-arc
- Circle Agent Stack: https://github.com/circlefin/agent-stack-starter-kits
- Privy: https://docs.privy.io/
- LiteAPI: https://docs.liteapi.travel/reference
                               