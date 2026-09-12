# SPEC — Perdiem: confidential hotel booking with a private buyer policy

The live specification. It states what the demo builds and nothing else.

- Vocabulary: `CONTEXT.md`. Terms are used here without redefinition.
- Trade-offs and reasoning: `docs/adr/` and `docs/grilling-session.md`.
- Verified facts and open questions: `docs/decisions.md`. Nothing gets written against an open row.
- Page and video: `docs/demo.md`. Frozen original idea: `docs/initial-spec.md`.

## Pitch

A corporate travel desk states a booking need in one English sentence. A large language model turns
it into a Policy: hard requirements, weighted preferences, and a maximum price. The buyer confirms
once, and the Policy Hash lands on chain before any Bid exists. The buyer locks a Payout Cap in
Escrow on Arc. The Policy goes into a Chainlink CRE confidential workflow as a secret. Supplier
agents each submit one Sealed Bid. The Enclave scores them against the private Policy and reports
only the winner, the Payout and the booking id. The contract pays the winner, refunds the rest, and
refunds every Stake.

The result that matters: three bids arrive, the cheapest loses, the second cheapest wins. The buyer
pays more than the cheapest on purpose, for what the private Policy values.

Tagline: "Commit the policy. Score in the enclave. The chain pays."

## Goals

1. Policy Hash on chain before bidding opens, verifiable by block order.
2. Policy readable only inside `handlerInTee`, never on the workflow nodes.
3. Sealed, single-shot bids. No supplier sees another's Bid before scoring.
4. Payout within the Payout Cap, only to the reported winner, only against the committed Policy Hash
   and the on-chain Bid Commitments.
5. The Enclave books the winning bid against the supplier's own API and reports the booking id, so
   no payout exists without a booking nobody self-attested.
6. Buyer funding goes through a Privy organization wallet with a spend policy and a key quorum.
7. Supplier agent wallets come from the Circle Agent Stack, one wallet per agent.
8. A working page, a working backend, an architecture diagram, a README and a two-minute video.

Non-goals: one buyer only, no reputation or supplier registry, first price rather than Vickrey, no
iterative bidding, demo keys in `.env`, LiteAPI sandbox guests only, no mainnet. The booked price is
not compared with the bid price, and no cancellation path exists.

## Architecture

| Directory      | What it is                                                                   |
| -------------- | ---------------------------------------------------------------------------- |
| `onchain/`     | `SealedAuction.sol` on Arc testnet. Hardhat 3, solc 0.8.34                   |
| `workflow/`    | The Chainlink CRE workflow. Scoring runs inside `handlerInTee`               |
| `supplier/`    | Three supplier agents. A model prices, one tool executes                     |
| `requisition/` | The buyer's service: intent parsing, policy commit, Privy funding            |
| `relay/`       | A blind store for Sealed Bids. Holds ciphertext, serves the Enclave          |
| `web/`         | One page, five panels                                                        |
| `shared/`      | Types, schemas, canonical JSON, hashing. Shared by everything except scoring |

### Flow

1. The buyer types one sentence. `requisition/` makes one model call and returns a Policy, validated
   against its schema. One retry at most, then it fails.
2. The buyer confirms. `requisition/` canonicalizes the Policy and computes the Policy Hash.
3. `requisition/` uploads the Policy as a workflow secret, then calls `createAuction`, which pulls
   the Payout Cap in the same call. State is `Created`. The enclave private key is not its business:
   an independent party uploads that one.
4. Privy signs that call from the organization wallet and `requisition/` broadcasts it. Above the
   ceiling, the key quorum approves.
5. Each agent builds one Bid, signs it with EIP-712, commits `keccak256(abi.encode(bidHash, salt))`
   with its Stake, and posts the Sealed Bid to the relay. Both before `bidDeadline`, in either
   order. The first commit moves the auction to `Bidding`.
6. There is no reveal phase. See `docs/adr/0001-no-reveal-phase.md`.
7. After `bidDeadline` the workflow claims the auction with a claim report. The Enclave fetches the
   Sealed Bids, decrypts them, checks each signature and each commitment, filters for Eligible,
   scores, picks a winner, and builds the Bids Root.
8. The Enclave books the winner's hotel with the credentials sealed inside that bid, and reads the
   booking back.
9. Only the Settlement leaves the Enclave. The workflow writes it to `SealedAuction`.
10. The contract checks the Policy Hash, the Bids Root, the Payout Cap and the booking id, then pays
    the winner, refunds the buyer, refunds every Stake, and moves to `Finalized`.

## Policy

Private. Only its hash reaches the chain. The schema is settled; code is written against it. A
changed field name, unit or number changes every Policy Hash, so it needs a new `version` and a
regenerated fixture.

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
    "numberOfRooms": 1
  },
  "tradeDown": { "stars": 3, "requiredDiscountPercentage": 30 },
  "preferences": { "refundable": 50000000, "breakfastIncluded": 40000000 }
}
```

- Every number is an integer: money in USDC minor units. A fraction has more than one shortest
  decimal form, and one digit of disagreement between two encoders produces two Policy Hashes.
- The requisition service converts what the buyer typed into these integers once, before the buyer
  confirms. Nothing downstream converts anything.
- A Preference Bonus is a flat number, not a rate: "20 a night" becomes what it is worth on this
  trip. Cost of that: a bonus no longer scales with the bid price.
- `version`, `currency` and `nights` are inside the hash and are read by nothing during scoring.
  They make a schema change a different hash, and they let a revealed Policy explain its numbers.
- Canonical encoding is one function in `shared/`. The buyer and the Enclave call that one function,
  so their bytes agree by construction. See `docs/adr/0003-canonical-encoding.md`.

Public Requirements, emitted in `TermsPublished`: city, checkin, checkout, minStars, roomType,
numberOfRooms, `tradeDown.stars`. Never emitted: `maxPrice`, `tradeDown.requiredDiscountPercentage`,
`preferences`. They have their own event because `AuctionCreated` carries only the identifier, the
buyer and the deadlines.

The Payout Cap is padded above `maxPrice`, because `transferFrom` is public and an exact cap would
publish the ceiling. Demo: Payout Cap 750, maximum price 520, Payout 440, refund 310. A workaround,
not a fix: the ceiling stays bounded from above by what anyone can see. The name is deliberate: the
cap bounds the Payout and states nothing about what the buyer is willing to pay.

## Bid

```json
{
  "auctionId": "0x…",
  "supplier": "0x…",
  "hotelId": "lp1a2b3",
  "hotelName": "Awesome Hotel",
  "stars": 4,
  "price": 440000000,
  "refundable": true,
  "breakfastIncluded": true,
  "roomType": "double",
  "numberOfRooms": 1
}
```

```
Bid(bytes32 auctionId,address supplier,string hotelId,string hotelName,uint8 stars,
    uint256 price,bool refundable,bool breakfastIncluded,string roomType,uint8 numberOfRooms)
```

Three hashes, and getting them the wrong way round is how honest bids get dropped:

- `bidHash` is the EIP-712 `hashStruct` of that type. No salt, no domain.
- The signature is over `keccak256(0x1901 || domainSeparator || bidHash)`.
- The Bid Commitment is `keccak256(abi.encode(bidHash, salt))`.

The salt is not a field of the Bid. It travels beside the Bid inside the Sealed Bid envelope, as
`{bid, salt, signature}`. Three reasons, and the third is why it is a type rule and not a
convention:

- The signature is checkable without the salt, so the Enclave verifies before it needs the secret.
- The commitment cannot be brute-forced by whoever holds the salt.
- A field the type does not have cannot reach `hashStruct` by accident.

`hotelName` is signed and never scored; the page names the winner from it.

A supplier is a contract account, so the signature check is ERC-1271, not `ecrecover`. Circle agent
wallets are ERC-4337 smart contract accounts: `circle wallet sign typed-data` returns a 65-byte
ECDSA signature from the account's owner key, and recovering it yields the owner, never the wallet.
The wallet is the address that stakes, wins and gets paid, so the wallet is the address the
signature has to bind to. The check is therefore `eth_call isValidSignature(digest, signature)` on
the supplier address, valid on the magic value `0x1626ba7e`, where `digest` is the signed
`keccak256(0x1901 || domainSeparator || bidHash)` and not `bidHash`. `ecrecover` is tried first and
accepted when it returns the supplier, which keeps `createLocalSigner` working. See
`docs/scratch/verification/issues/07-circle-agent-stack-wallets.md`.

`auctionId` is `keccak256(abi.encode(auction))` over the auction record as it stands at creation, so
the identifier commits to the buyer, the Policy Hash, the Payout Cap and the three deadlines. Two
auctions with identical terms in one block would hash alike, and the second reverts with
`AuctionAlreadyExists`. Suppliers read the identifier from `AuctionCreated` and never derive it.

The EIP-712 domain is fixed per deployment, so a signature for one auction on one deployment cannot
be replayed against the same auction on another: `name "Perdiem"`, `version "1"`, `chainId` the Arc
testnet chain id, `verifyingContract` the `SealedAuction` address.

`stars`, `refundable` and `breakfastIncluded` are self-attested and no oracle contradicts them. The
booking is the exception: the Enclave books the winner itself, so `hotelId` is checked by the
supplier's own API before any USDC moves. So the claim is "the payout went to the supplier that
claimed the best fit against a private rule, and it booked", not "the best hotel wins". See
`docs/adr/0004-bid-attributes-are-self-attested.md`.

## Sealed Bid

The relay must never hold a readable Bid. A readable Bid leaks the salt, and the bid space is small
enough that keccak256 brute-forces the commitment in seconds without it.

- **Key**: one X25519 keypair per deployment, generated by an independent party. The private half is
  a workflow secret, loaded only inside `handlerInTee`. The public half is a constructor argument,
  readable as `SealedAuction.enclavePublicKey()`. It is fixed for the deployment, not per auction.
- **Envelope**: the agent seals `{bid, salt, signature, bookingUrl, bookingApiKey}` to that public
  key. The salt and the booking credentials go inside the ciphertext. Nothing but the ciphertext and
  the supplier address leaves the agent.
- **Booking credentials**: `bookingUrl` and `bookingApiKey` are the supplier's own booking API and
  the key that opens it. Each supplier ships its own; in this deployment the three are the same
  LiteAPI sandbox account. They are not fields of the Bid, so they never reach `hashStruct`, and the
  Enclave is the only party that reads them. See
  `docs/adr/0006-the-enclave-books-with-supplier-credentials.md`.
- **Enclave**: decrypt, check the EIP-712 signature, then check the commitment. Any failure drops
  that bid, and only a count is logged. The signature check costs one `eth_call` per bid, because a
  contract-account supplier is checked with ERC-1271.

The envelope is `epk(32) || nonce(24) || ciphertext`, with the key
`HKDF-SHA256(X25519(esk, enclavePublicKey), epk || enclavePublicKey, "perdiem/sealed-bid/v1" || auctionId, 32)`
and XChaCha20-Poly1305 over the JSON. One ephemeral keypair per bid. `@noble/curves`,
`@noble/ciphers` and `@noble/hashes` on both sides, which `viem` already puts in the tree. Verified
in a confidential handler, row V3: 11 ms per bid, 30 ms for three. A wrong key or one flipped byte
fails with `invalid tag`. See `docs/adr/0005-sealed-bid-envelope-scheme.md` for the schemes this
beat.

The keypair is generated by an independent party, neither the buyer nor any supplier, and only the
public half reaches the deployment. Whoever holds the private half can read every Sealed Bid and
every supplier's booking credentials, so the buyer must not be that party. The enclave cannot
generate the pair itself: it has no randomness, and `x25519.utils.randomPrivateKey()` throws
`crypto.getRandomValues must be defined` there.

### The relay interface

No authentication. The relay stores bytes: it parses no ciphertext, knows no deadline, holds no
auction state.

| Call                                        | Behaviour                                                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `PUT /auctions/{auctionId}/bids/{supplier}` | Body is the raw ciphertext. `201` on the first write for that pair, `409` on any later one, `413` over 16 KiB |
| `GET /auctions/{auctionId}/bids`            | `200` with `[{ supplier, ciphertext }]`, in arrival order. `[]` for an unknown auction                        |

First write wins, because the commitment is already on chain: overwriting would only swap the bid
behind a fixed commitment, which the Enclave then drops. No delete, no auction listing.

What open access costs: a supplier can fetch a rival's ciphertext and count the bids. No price
leaks, because only the Enclave holds the private key. Bearer tokens are the obvious hardening and
are out of scope.

## Settlement

```solidity
struct Settlement {
  bytes32 auctionId;
  address winner;
  uint256 payout;      // USDC minor units, first price
  bytes32 policyHash;
  bytes32 bidsRoot;
  string bookingId;    // the supplier's booking reference, read back by the Enclave
}
```

No Eligible bid means `winner = address(0)`, `payout = 0` and an empty `bookingId`, and the contract
refunds the Payout Cap and every Stake. A booking that fails takes the same path: no booking, no
winner, no payout. A settlement that names a winner and carries an empty `bookingId` is rejected, so
the contract never pays for a booking that does not exist.

`bookingId` is stored nowhere. It is emitted in `AuctionFinalized`, because no on-chain rule reads
it after the check.

The Bids Root binds the Settlement to the exact set of on-chain commitments, so no bid can be
dropped or swapped between the chain and the Enclave. The Enclave reads `commitments` from the chain
itself and hashes the array as it stands. It does this with `EVMClient.callContract`, which is typed
for `Runtime` and takes the `TeeRuntime` through a cast. Verified in simulation only: row V2.

The construction is exact, because the contract recomputes it and one byte of difference rejects a
correct settlement:

```
bidsRoot = keccak256(abi.encodePacked(commitments))  // every commitment for the auction, in the
                                                     // order it arrived
bidsRoot = bytes32(0)                                // when there are no commitments at all
```

The array itself carries the order, so neither side sorts. `commit` is once per address, so
duplicates cannot occur, and at most `MAX_BIDS` commitments, 5, can be placed on one auction.

The root covers **all** on-chain commitments, including a committer whose Sealed Bid never arrived.
Build it over only the scored bids and one missing blob turns a good auction into a timeout refund.

## Scoring

Inside the Enclave. Deterministic integer arithmetic.

1. Decrypt, check the signature by `ecrecover` then ERC-1271, check the commitment. Drop any
   failure; log counts only.
2. Eligibility, per bid:
   - city, checkin, checkout, roomType and numberOfRooms equal the hard requirements.
   - `price <= maxPrice`.
   - `stars >= minStars`, **or** the Trade-Down applies: `stars == tradeDown.stars` and
     `price * 100 <= cheapestEligibleAtMinStars * (100 - tradeDown.requiredDiscountPercentage)`.
     Compute `cheapestEligibleAtMinStars` first, over bids that pass every other check with
     `stars >= minStars`. With no such bid, a trade-down bid is Eligible on `price <= maxPrice`
     alone.
3. Score, per Eligible bid: `bonus = 0`, then `+= preferences.refundable` if `refundable`, then
   `+= preferences.breakfastIncluded` if `breakfastIncluded`. `score = (maxPrice - price) + bonus`.
4. The winner is the highest score. Ties break on lower price, then lower supplier address.
5. `payout = winner.price`.
6. Book the winner, with the booking credentials from its own envelope. See "Booking".

`maxPrice` is the same for every bid, so it cannot change the ranking. It stays in the formula
because it makes scores positive and readable during the demo.

### Booking

Still inside the Enclave, after the winner is picked and before anything leaves.

1. `POST {bookingUrl}/hotels/rates` with the winner's `hotelId`, the Policy's dates and
   `maxRatesPerHotel: 1`.
2. `POST {bookingUrl}/rates/prebook` with the `offerId` from that answer.
3. `POST {bookingUrl}/rates/book` with the `prebookId` and `clientReference` set to the `auctionId`.
4. `GET {bookingUrl}/bookings?clientReference={auctionId}` and take `bookingId` from that read,
   never from the write's own answer.

Step 4 is what makes the write safe to repeat. Every node derives the same `clientReference`, so a
second identical book is refused with code `4005` in 190 ms and the read-back still returns one
record. The nodes then agree byte for byte on a read rather than on a write, and a retried run or a
re-fired cron tick books nothing twice. Row V14.

The search cannot be skipped. `prebook` takes an `offerId`, only `POST /hotels/rates` mints one, and
an `offerId` goes stale in minutes, so the Bid cannot carry one either. `maxRatesPerHotel: 1` keeps
the answer at 3,023 bytes against the HTTP capability's 250 KB ceiling; the same search without it
returns 589,856 bytes and fails the run with `[8]ResourceExhausted`. The three calls take 7,650 ms
against a 10 s per-request timeout. Row V14.

Any failure in those four steps means no booking: `winner = address(0)`, `payout = 0`, and every
Stake and the Payout Cap go back. The Enclave does not fall through to the second-best bid.

The booked price is not checked against the bid price. The supplier keeps the difference or eats it,
which is the same arrangement it has when it books for itself.

### The demo table

One double room, two nights. Payout Cap 750, maximum price 520, `refundable` 50,
`breakfastIncluded` 40. Whole USDC here for reading; the test carries the same figures in minor
units.

| Bid | Stars | Price | Refundable | Breakfast | Result                                                                                 |
| --- | ----- | ----- | ---------- | --------- | -------------------------------------------------------------------------------------- |
| A   | 3     | 330   | yes        | no        | Ineligible. 330 is 17.5% under the cheapest four-star bid; the Trade-Down asks for 30% |
| B   | 4     | 400   | no         | no        | Score 120                                                                              |
| C   | 4     | 440   | yes        | yes       | Score 80 + 50 + 40 = **170. Wins**                                                     |

Payout 440, refund 310. All three Stakes come back at settlement. This table is a test in
`workflow/`.

### Every USDC in and out

Nine hundred USDC enters escrow: the 750 Payout Cap and three 50 Stakes. Every terminal path returns
exactly that, and each row is a contract test.

| Path                                         | Out                               |
| -------------------------------------------- | --------------------------------- |
| Winner and booking                           | 440 winner, 310 buyer, 150 Stakes |
| No Eligible bid, or the booking failed       | 750 buyer, 150 Stakes             |
| Timeout from `Bidding` or `Settling`         | 750 buyer, 150 Stakes             |
| No commit before `bidDeadline`, then timeout | 750 buyer, nothing else entered   |

## Contract

`onchain/contracts/SealedAuction.sol`. It plays the Escrow role while it holds the Payout Cap and
the Stakes.

```
Created   → funded at creation, no commit yet
Bidding   → commitments on chain and sealed bids at the relay, both until bidDeadline
Settling  → the workflow has claimed the auction and is scoring it
Finalized → terminal, with or without a winner
Timeout   → terminal, everything refunded
```

- `Created → Bidding` on the first commit, with no extra transaction. The contract never sees the
  sealed post.
- The claim report drives `Bidding → Settling`, not the clock. A time-based flip cannot tell "the
  workflow never ran" from "the workflow ran and its settlement was rejected". It costs one extra
  write and it says which service to debug during the demo.
- `Settling → Finalized` on a valid settlement, with or without a winner.
- Any of `Created`, `Bidding` and `Settling` `→ Timeout` through `timeoutRefund`, past
  `finalizeDeadline`. `Created` is in the list because row five of "Every USDC in and out" is an
  auction nobody committed to, and its Payout Cap is stuck forever without it.
- Delivery is not a state and not a later transaction. The booking is proven inside the settlement
  that pays for it, so `Finalized` is the end of the auction. The booking id is a log line in
  `AuctionFinalized`, because no on-chain rule reads it after the check.
- `finalizeDeadline` stops a losing bidder from refunding the auction a second after `bidDeadline`,
  before the Enclave ever ran. The gap covers the cron interval, the claim, scoring and the write.

The deadlines are contract constants offset from `block.timestamp` at creation, and `createAuction`
takes either of them: `BID_PERIOD` 2 hours and `FINALIZE_PERIOD` 4 hours. A buyer cannot open an
auction that is undeliverable, because a buyer cannot choose.

### Functions

- `createAuction(policyHash, publicRequirements, payoutCap) → auctionId` — any address. The caller
  is the buyer of the auction it opens. Derives both deadlines from `block.timestamp`, hashes the
  record for the identifier, pulls the Payout Cap, and emits `AuctionCreated` then `TermsPublished`.
- `commit(auctionId, commitment)` — any address, once, before `bidDeadline`, up to `MAX_BIDS` per
  auction. Pulls the `SUPPLIER_STAKE` constant, 50 USDC. Emits `Committed`.
- `onReport(bytes metadata, bytes report)` — the CRE forwarder only, through the Chainlink receiver
  template. The name belongs to Chainlink and is kept verbatim; everywhere else the word is
  "settlement". It is the only entry a workflow has, so it carries both writes and dispatches on an
  action: `1` is the claim, `2` is the settlement. An unknown action reverts.
  - `report` is `abi.encode(uint8 action, bytes payload)`. The claim payload is
    `abi.encode(bytes32 auctionId)`. The settlement payload is `abi.encode(Settlement)`.
  - Action `1` requires `Bidding` and `block.timestamp >= bidDeadline`, then moves to `Settling`.
  - Action `2` requires `Settling`, a matching Policy Hash, a matching Bids Root, a Payout within
    the Payout Cap, a winner that either committed or is the zero address, and a non-empty
    `bookingId` whenever there is a winner. Pays, refunds every Stake, finalizes, and emits the
    booking id in `AuctionFinalized`.
  - It reads nothing from `metadata`: simulation passes a placeholder workflow id and workflow
    owner. The action cannot live there either, because `reportId` is `0001` for every report in one
    run. Row V8.
  - `_startSettling(auctionId)` and `_settle(settlement)` are internal, reached only through a
    report. The `evm@1.0.0` capability has one write RPC, `writeReport`, with no calldata field, so
    a workflow cannot call any other function on the receiver. Row V8.
- `supportsInterface(bytes4 id) → bool` — returns `true` for `0x01ffc9a7` and for the `IReceiver`
  interface id `0x805f2132`, and `false` for everything else. The forwarder probes it before every
  settlement. A receiver that answers `true` to `0xffffffff` is skipped: the forwarder calls nothing
  and emits `ReportProcessed(result: false)`, while the workflow still reads `TxStatus.SUCCESS`. The
  auction then sits in `Settling` until `timeoutRefund`. A test asserts the `0xffffffff` answer.
- `timeoutRefund(auctionId)` — anyone, from `Created`, `Bidding` or `Settling`, after
  `finalizeDeadline` with no settlement. Refunds the Payout Cap and every Stake. A liveness
  fallback, documented as one.

Three views, because the workflow holds no state of its own:

- `pendingSettlement() → bytes32` — an `auctionId` in `Bidding` with
  `block.timestamp >= bidDeadline`, or `bytes32(0)`. The cron reads this. A hashed identifier cannot
  be enumerated, so this needs a list of open auctions written by `createAuction` and cleared on
  `Finalized` and `Timeout`.
- `commitments(auctionId) → bytes32[]` — arrival order. The Bids Root is built from this array.
- `committers(auctionId) → address[]` — the suppliers, in the same order.
- `commitmentOf(auctionId, supplier) → bytes32` — one supplier's commitment, `bytes32(0)` when it
  never committed.
- `hasCommitted(auctionId, supplier) → bool` — the same question as a yes or no.

All four mappings are internal and these are hand-written getters. A generated array getter takes an
index, returns one element and reports no length, so a caller cannot read a whole array with it.

- `auctions(auctionId) → Auction` — the mapping is public, so the getter is generated: state, buyer,
  `createdAt`, both deadlines, Policy Hash, Payout Cap, winner, Payout.

Invariants: USDC out never exceeds USDC in, per auction; no payout unless the Policy Hash and the
Bids Root both match and a booking id is present; the buyer cannot withdraw between `createAuction`
and `Finalized`, except through `timeoutRefund`; `Finalized` and `Timeout` are terminal.

Tests: the happy path end to end; a wrong Policy Hash rejected; a wrong Bids Root rejected; a claim
report from a non-forwarder rejected; a settlement report before the claim report rejected; an
unknown report action rejected; a settlement with a winner and an empty booking id rejected;
`timeoutRefund` before `finalizeDeadline` rejected; a duplicate auction in one block rejected; the
no-winner path; the timeout path.

## CRE workflow

- Start from `cre init --template=hello-confidential-workflows-ts`.
- A cron trigger, every 60 seconds in simulation, calls `pendingSettlement()`. On `bytes32(0)`,
  exit.
- Claim the auction with an action `1` report before any scoring work.
- Inside `handlerInTee`: load the Policy and the enclave private key from secrets; read the
  commitments from the chain; fetch the Sealed Bids with `cre.capabilities.HTTPClient`; decrypt;
  check signatures; check commitments; build the Bids Root; score; book the winner; return only the
  Settlement.
- The same `HTTPClient.sendRequest` carries the booking, with `method` and a `body`. The capability
  caps a request at 120 KB and a response at 250 KB, and times out at 10 s per request, so every
  call to a supplier API bounds its own answer. Row V14.
- The workflow nodes never read the commitments and never compute the Bids Root.
- Encode the Settlement as an action `2` report and write it to `SealedAuction`. Two `writeReport`
  calls fit one run and the second sees the state the first committed, so the claim and the
  settlement need no second cron tick. Row V8.
- Save one full `cre workflow simulate` run to `docs/scratch/verification/evidence/`.

The relay runs on `http://localhost:8787` and the handler reads it there: in simulation the HTTP
capability runs in the CLI's own process, so localhost resolves, plain HTTP is allowed and no host
allow list exists. Verified in row V13. A deployed workflow cannot reach a developer's machine, so a
deployed demo needs the relay on a public host.

Secrets are environment variables named in `secrets.yaml`, and `cre workflow simulate` needs
`-e .env` to resolve them. One secret holds at most 131,072 bytes, which is the operating system's
`exec` limit rather than a CRE limit. The Policy is 425 characters and the enclave private key
is 44. Verified in row V4.

Never logged outside the enclave section: the Policy, the maximum price, the preferences, the
enclave private key, any decrypted Bid, any supplier's booking credentials. Grep the logs before
committing them.

## Supplier agents

Three processes, one codebase, three prompts. Each agent is a Claude tool-calling loop. An operator
starts it with one sentence of business rules, and the model reads the auction terms, applies the
rules, and submits one Bid. See `docs/adr/0007-supplier-agents-decide-with-a-model.md`.

```
You sell 3-star rooms in Paris. Room price is 330 USDC for 1 or 2 nights,
280 for 3 nights or more. In winter all prices drop to 240. Refundable,
no breakfast. Bid on requests.
```

The model derives two things from the auction rather than the prompt: nights from
`checkout - checkin`, and season from the month of `checkin`. Winter is December, January and
February, named in the system prompt so nothing guesses.

The hotel is configuration, not a decision. An operator reads the supplier's catalogue once and
writes the identifier, the name and the star level into `supplier/config/<name>.json`. Any valid
identifier is acceptable. The Enclave books against it, so it has to exist, and nothing else about
it is scored. Cost: a new supplier needs an operator to look one up.

The model holds one tool and nothing else:

- `submitBid(price, refundable, breakfastIncluded, roomType, numberOfRooms)` validates the fields,
  checks the price range, attaches the configured hotel, hashes the Bid, signs it, draws a salt,
  computes the Bid Commitment, seals `{bid, salt, signature, bookingUrl, bookingApiKey}`, commits on
  chain with the Stake, and posts the ciphertext to the relay. All of it in Node, all of it before
  `bidDeadline`.

Those steps have one legal order, so they are one tool. Split apart, a model can seal without
committing, commit without posting, or commit twice.

The model never sees a hash, a salt, a signature or a private key. A model that wrote its own
hashing would produce a commitment the Enclave drops, and that drop is silent.

An agent never books. It seals its own booking credentials into the envelope and the Enclave books
with them, so the agent has nothing to do after `bidDeadline`.

Each agent's configuration carries a `priceRange`, and `submitBid` refuses a price outside it. The
demo result is a knife edge: Agent A stays Ineligible only above 280, and Agent C wins only
below 490. The range is configuration, not a hidden rule.

The price is prompt-derived, not market-derived. LiteAPI supplies a real hotel, and the rate card
comes from the operator, so the number is the supplier's own list price. The claim is "three agents
priced one request by their own published rules", not "three agents priced against the market".
There is no deterministic fallback: an Anthropic API outage means no bid.

Each agent holds a Circle Agent Stack wallet, and that wallet signs the Bid and the `commit` call.
This is what the Arc track asks for, so it ships. It is required, not optional. Two signer
implementations sit behind one interface: `createCircleAgentSigner` is the demo path and
`createLocalSigner` is a viem externally owned account, kept so the bid flow and its tests run
without a Circle session. The bid flow never sees the difference.

Verified on Arc testnet, row V7:

- The wallet is provisioned by the first `circle wallet login <email> --testnet`. There is nothing
  to create.
- `circle wallet execute` broadcasts a contract call and Circle pays the gas from the wallet.
- `circle wallet sign typed-data` signs the `Bid` type, and the wallet validates that signature
  through ERC-1271. Hence the check in the Bid section.
- Spending policies are mainnet only: `circle wallet limit` refuses a testnet chain. On Arc testnet
  the agent wallet runs on Circle's default policy, so supplier-side limits are not part of the
  demo. Buyer-side control is the Privy half, where the rules read calldata and a quorum signs.
- The session is email OTP and lasts 28 days. A human types the code once per agent, and creating or
  changing a policy needs another. Nothing else in the run is interactive.

## Requisition service

- `POST /intent` — one model call with a fixed system prompt, stored at `docs/ai/intent-prompt.md`,
  validated against the Policy schema. One retry, then it fails.
- `POST /confirm` — canonicalize, hash, upload the Policy as a workflow secret, call `createAuction`
  with the Payout Cap. It never holds the enclave private key.
- Privy: the organization wallet signs with `eth_signTransaction` and the requisition service
  broadcasts the signed RLP to `ARC_RPC_URL`. Privy does not broadcast on Arc: `eth_sendTransaction`
  returns `App is not authorized to transact on chain eip155:5042002`.
- Funding takes two signed transactions, so the spend policy needs two `ALLOW` rules. Both read the
  calldata, not just the destination address:
  - `approve(spender, value)` on the USDC ERC-20, with `spender` equal to `SealedAuction`.
  - `createAuction(...)` on `SealedAuction`, with the `payoutCap` argument within the signer's
    ceiling.
- A calldata rule is `field_source: ethereum_calldata` and needs the contract's JSON ABI in the
  condition. A rule on the destination address alone would let any call through, including one that
  approves a different spender.
- Every rule also pins `chain_id` to 5042002 and uses `method: eth_signTransaction`.
- The ceiling is 500 USDC and the demo Payout Cap is 750, so the quorum fires in the video every
  time. A Payout Cap under 500 goes through on the policy alone, which is the path the tests use.
- The ceiling is a per-signer override policy, not a quorum threshold. A quorum threshold is fixed
  and cannot depend on the Payout Cap. The wallet carries two signers: a server authorization key
  capped at the ceiling, and a key quorum of two, travel manager and finance, with no cap. The
  requisition service picks the signer from the Payout Cap. Unverified: the override-policy path is
  documented and has not been run.

## Links

- Confidential Workflows: https://docs.chain.link/cre/concepts/confidential-workflows
- Using them: https://docs.chain.link/cre/guides/workflow/using-confidential-workflows
- The template: https://docs.chain.link/cre-templates/hello-confidential-workflows
- Connect to Arc: https://docs.arc.io/arc/references/connect-to-arc
- Privy: https://docs.privy.io/
- LiteAPI: https://docs.liteapi.travel/reference
