# SPEC — Perdiem: confidential hotel booking with a private buyer policy

The live specification. It states what the demo builds and nothing else.

- Vocabulary: `CONTEXT.md`. Terms are used here without redefinition.
- Trade-offs and reasoning: `docs/adr/` and `docs/grilling-session.md`.
- Verified facts and open questions: `docs/decisions.md`. Nothing gets written against an open row.
- Page and video: `docs/demo.md`. Frozen original idea: `docs/initial-spec.md`.

## Pitch

A corporate travel desk states a booking need in one English sentence. A large language model turns
it into a Policy: hard requirements, weighted preferences, and a maximum price. The buyer confirms
once, and the Policy Hash lands on chain before any Bid exists. The buyer locks a Budget in Escrow
on Arc. The Policy goes into a Chainlink CRE confidential workflow as a secret. Supplier agents each
submit one Sealed Bid. The Enclave scores them against the private Policy and reports only the
winner and the Payout. The contract pays the winner, refunds the rest, and holds the winner's Stake
until a booking Receipt arrives.

The result that matters: three bids arrive, the cheapest loses, the second cheapest wins. The buyer
pays more than the cheapest on purpose, for what the private Policy values.

Tagline: "Commit the policy. Score in the enclave. The chain pays."

## Goals

1. Policy Hash on chain before bidding opens, verifiable by block order.
2. Policy readable only inside `handlerInTee`, never on the workflow nodes.
3. Sealed, single-shot bids. No supplier sees another's Bid before scoring.
4. Payout within Budget, only to the reported winner, only against the committed Policy Hash and the
   on-chain Bid Commitments.
5. The winner delivers a real LiteAPI sandbox booking and posts a Receipt. Stake slashed on silence.
6. Buyer funding goes through a Privy organization wallet with a spend policy and a key quorum.
7. Supplier agent wallets come from the Circle Agent Stack, one wallet per agent.
8. A working page, a working backend, an architecture diagram, a README and a two-minute video.

Non-goals: one buyer only, no reputation or supplier registry, first price rather than Vickrey, no
iterative bidding, demo keys in `.env`, LiteAPI sandbox guests only, no mainnet.

## Architecture

| Directory       | What it is                                                                   |
| --------------- | ---------------------------------------------------------------------------- |
| `onchain/`      | `SealedAuction.sol` on Arc testnet. Hardhat 3, solc 0.8.34                   |
| `workflow/`     | The Chainlink CRE workflow. Scoring runs inside `handlerInTee`               |
| `agents/`       | Three supplier agents. One wraps the LiteAPI sandbox                         |
| `requisition/`  | The buyer's service: intent parsing, policy commit, Privy funding            |
| `relay/`        | A blind store for Sealed Bids. Holds ciphertext, serves the Enclave          |
| `web/`          | One page, five panels                                                        |
| `packages/core` | Types, schemas, canonical JSON, hashing. Shared by everything except scoring |

### Flow

1. The buyer types one sentence. `requisition/` makes one model call and returns a Policy, validated
   against its schema. One retry at most, then it fails.
2. The buyer confirms. `requisition/` canonicalizes the Policy and computes the Policy Hash.
3. `requisition/` uploads the Policy and the enclave private key as workflow secrets, then calls
   `createAuction`, which pulls the Budget in the same call. State is `Created`.
4. Privy signs that call from the organization wallet and `requisition/` broadcasts it. Above the
   ceiling, the key quorum approves.
5. Each agent builds one Bid, signs it with EIP-712, commits `keccak256(abi.encode(bidHash, salt))`
   with its Stake, and posts the Sealed Bid to the relay. Both before `bidDeadline`, in either
   order. The first commit moves the auction to `Bidding`.
6. There is no reveal phase. See `docs/adr/0001-no-reveal-phase.md`.
7. After `bidDeadline` the workflow claims the auction with a claim report. The Enclave fetches the
   Sealed Bids, decrypts them, checks each signature and each commitment, filters for Eligible,
   scores, picks a winner, and builds the Bids Root.
8. Only the Settlement leaves the Enclave. The workflow writes it to `SealedAuction`.
9. The contract checks the Policy Hash, the Bids Root and the Budget, then pays the winner, refunds
   the buyer, refunds the losing Stakes, and moves to `Finalized`.
10. The winner books through LiteAPI and posts the Receipt, which releases its Stake. No Receipt by
    `deliverDeadline` and anyone may slash the Stake to the buyer.

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
    "numberOfRooms": 1,
    "location": { "name": "Gare du Nord", "latitudeMicro": 48880900, "longitudeMicro": 2355300 },
    "radiusMeters": 2000
  },
  "tradeDown": { "stars": 3, "requiredDiscountPercentage": 30 },
  "preferences": { "refundable": 50000000, "breakfastIncluded": 40000000 }
}
```

- Every number is an integer: money in USDC minor units, distance in metres, coordinates in
  microdegrees. A fraction has more than one shortest decimal form, and one digit of disagreement
  between two encoders produces two Policy Hashes.
- The requisition service converts what the buyer typed into these integers once, before the buyer
  confirms. Nothing downstream converts anything.
- A Preference Bonus is a flat number, not a rate: "20 a night" becomes what it is worth on this
  trip. Cost of that: a bonus no longer scales with the bid price.
- `version`, `currency` and `nights` are inside the hash and are read by nothing during scoring.
  They make a schema change a different hash, and they let a revealed Policy explain its numbers.
- Canonical encoding is one function in `packages/core`, with a golden fixture both sides assert
  against. See `docs/adr/0003-canonical-encoding.md`.

Public Requirements, emitted in `AuctionCreated`: city, checkin, checkout, minStars, roomType,
numberOfRooms, location, radiusMeters, `tradeDown.stars`. Never emitted: `maxPrice`,
`tradeDown.requiredDiscountPercentage`, `preferences`.

The Budget is padded above `maxPrice`, because `transferFrom` is public and an exact Budget would
publish the ceiling. Demo: Budget 750, maximum price 520, Payout 440, refund 310. A workaround, not
a fix: the ceiling stays bounded from above by what anyone can see.

## Bid

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

```
Bid(bytes32 auctionId,address supplier,string hotelId,string hotelName,uint8 stars,
    uint32 distanceMeters,uint256 price,bool refundable,bool breakfastIncluded,
    string roomType,uint8 numberOfRooms)
```

Three hashes, and getting them the wrong way round is how honest bids get dropped:

- `bidHash` is the EIP-712 `hashStruct` of that type. No salt, no domain.
- The signature is over `keccak256(0x1901 ‖ domainSeparator ‖ bidHash)`.
- The Bid Commitment is `keccak256(abi.encode(bidHash, salt))`.

The salt stays out of the struct hash, so the signature is checkable without it and the commitment
cannot be brute-forced with it. `hotelName` is signed and never scored; the page names the winner
from it.

A supplier is a contract account, so the signature check is ERC-1271, not `ecrecover`. Circle agent
wallets are ERC-4337 smart contract accounts: `circle wallet sign typed-data` returns a 65-byte
ECDSA signature from the account's owner key, and recovering it yields the owner, never the wallet.
The wallet is the address that stakes, wins and gets paid, so the wallet is the address the
signature has to bind to. The check is therefore `eth_call isValidSignature(digest, signature)` on
the supplier address, valid on the magic value `0x1626ba7e`, where `digest` is the signed
`keccak256(0x1901 ‖ domainSeparator ‖ bidHash)` and not `bidHash`. `ecrecover` is tried first and
accepted when it returns the supplier, which keeps `createLocalSigner` working. See
`docs/scratch/verification/issues/07-circle-agent-stack-wallets.md`.

`auctionId` is a monotonic counter cast to `bytes32`, so the first auction is `0x00…01`. Suppliers
read it from `AuctionCreated` and never derive it. The EIP-712 domain is fixed per deployment, so a
signature for auction 1 on one deployment cannot be replayed against auction 1 on another:
`name "Perdiem"`, `version "1"`, `chainId` the Arc testnet chain id, `verifyingContract` the
`SealedAuction` address.

`stars`, `distanceMeters`, `refundable` and `breakfastIncluded` are self-attested and no oracle
contradicts them. The Stake is the only enforcement. So the claim is "the payout went to the
supplier that claimed the best fit against a private rule", not "the best hotel wins". See
`docs/adr/0004-bid-attributes-are-self-attested.md`.

## Sealed Bid

The relay must never hold a readable Bid. A readable Bid leaks the salt, and the bid space is small
enough that keccak256 brute-forces the commitment in seconds without it.

- **Key**: one X25519 keypair per deployment. The private half is a workflow secret, loaded only
  inside `handlerInTee`. The public half is a `createAuction` argument, emitted in `AuctionCreated`.
- **Envelope**: the agent seals `{bid, salt, signature}` to that public key. The salt goes inside
  the ciphertext. Nothing but the ciphertext and the supplier address leaves the agent.
- **Enclave**: decrypt, check the EIP-712 signature, then check the commitment. Any failure drops
  that bid, and only a count is logged. The signature check costs one `eth_call` per bid, because a
  contract-account supplier is checked with ERC-1271.

The envelope is `epk(32) ‖ nonce(24) ‖ ciphertext`, with the key
`HKDF-SHA256(X25519(esk, enclavePublicKey), epk ‖ enclavePublicKey, "perdiem/sealed-bid/v1" ‖ auctionId, 32)`
and XChaCha20-Poly1305 over the JSON. One ephemeral keypair per bid. `@noble/curves`,
`@noble/ciphers` and `@noble/hashes` on both sides, which `viem` already puts in the tree. Verified
in a confidential handler, row V3: 11 ms per bid, 30 ms for three. A wrong key or one flipped byte
fails with `invalid tag`. See `docs/adr/0005-sealed-bid-envelope-scheme.md` for the schemes this
beat.

Known limitation: `requisition/` generates the keypair, so the buyer holds the private half and
could decrypt every Sealed Bid. Suppliers are protected from each other, not from the buyer. The
enclave cannot generate the pair itself: it has no randomness, and `x25519.utils.randomPrivateKey()`
throws `crypto.getRandomValues must be defined` there.

### The relay interface

No authentication. The relay stores bytes: it parses no ciphertext, knows no deadline, holds no
auction state.

| Call                                        | Behaviour                                                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `PUT /auctions/{auctionId}/bids/{supplier}` | Body is the raw ciphertext. `201` on the first write for that pair, `409` on any later one, `413` over 16 KiB |
| `GET /auctions/{auctionId}/bids`            | `200` with `[{ supplier, ciphertext }]`, ascending by supplier address. `[]` for an unknown auction           |

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
}
```

No Eligible bid means `winner = address(0)` and `payout = 0`, and the contract refunds the Budget
and every Stake.

The Bids Root binds the Settlement to the exact set of on-chain commitments, so no bid can be
dropped or swapped between the chain and the Enclave. The Enclave reads `commitmentsOf` from the
chain itself and hashes the sorted set. It does this with `EVMClient.callContract`, which is typed
for `Runtime` and takes the `TeeRuntime` through a cast. Verified in simulation only: row V2.

The construction is exact, because the contract recomputes it and one byte of difference rejects a
correct settlement:

```
bidsRoot = keccak256(abi.encodePacked(sorted))   // every commitment for the auction, ascending
                                                 // as unsigned 32-byte big-endian
bidsRoot = bytes32(0)                            // when there are no commitments at all
```

`commit` is once per address, so duplicates cannot occur. The contract keeps commitments in arrival
order and sorts a memory copy when it verifies.

The root covers **all** on-chain commitments, including a committer whose Sealed Bid never arrived.
Build it over only the scored bids and one missing blob turns a good auction into a timeout refund.

Receipt: `keccak256(bytes(liteApiBookingId))`.

## Scoring

Inside the Enclave. Deterministic integer arithmetic.

1. Decrypt, check the signature by `ecrecover` then ERC-1271, check the commitment. Drop any
   failure; log counts only.
2. Eligibility, per bid:
   - city, checkin, checkout, roomType and numberOfRooms equal the hard requirements.
   - `distanceMeters <= radiusMeters`.
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

`maxPrice` is the same for every bid, so it cannot change the ranking. It stays in the formula
because it makes scores positive and readable during the demo.

### The demo table

One double room, two nights. Budget 750, maximum price 520, `refundable` 50, `breakfastIncluded` 40.
Whole USDC here for reading; the test carries the same figures in minor units.

| Bid | Stars | Distance | Price | Refundable | Breakfast | Result                                                                                 |
| --- | ----- | -------- | ----- | ---------- | --------- | -------------------------------------------------------------------------------------- |
| A   | 3     | 500 m    | 330   | yes        | no        | Ineligible. 330 is 17.5% under the cheapest four-star bid; the Trade-Down asks for 30% |
| B   | 4     | 700 m    | 400   | no         | no        | Score 120                                                                              |
| C   | 4     | 1000 m   | 440   | yes        | yes       | Score 80 + 50 + 40 = **170. Wins**                                                     |

Payout 440, refund 310. A and B get their Stakes back at settlement; C's is released on the Receipt.
This table is a test in `workflow/`.

### Every USDC in and out

Nine hundred USDC enters escrow: the 750 Budget and three 50 Stakes. Every terminal path returns
exactly that, and each row is a contract test.

| Path                                         | Out                                                         |
| -------------------------------------------- | ----------------------------------------------------------- |
| Winner, Receipt posted                       | 440 winner, 310 buyer, 100 losing Stakes, 50 winner Stake   |
| Winner, silence, then slashed                | 440 winner, 310 buyer, 100 losing Stakes, 50 Stake to buyer |
| No Eligible bid                              | 750 buyer, 150 Stakes                                       |
| Timeout from `Bidding` or `Settling`         | 750 buyer, 150 Stakes                                       |
| No commit before `bidDeadline`, then timeout | 750 buyer, nothing else entered                             |

## Contract

`onchain/contracts/SealedAuction.sol`. It plays the Escrow role while it holds the Budget and the
Stakes.

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
  auction nobody committed to, and its Budget is stuck forever without it.
- Delivery is not a state. After `Finalized`, `receiptHash`, `stakeReleased` and `stakeSlashed` are
  fields on the auction.
- `finalizeDeadline` stops a losing bidder from refunding the auction a second after `bidDeadline`,
  before the Enclave ever ran. The gap covers the cron interval, the claim, scoring and the write.

Demo deadlines, all passed to `createAuction`, none of them constants: `bidDeadline` creation + 90
seconds, `finalizeDeadline` + 180 seconds, `deliverDeadline` + 600 seconds.

### Functions

- `createAuction(policyHash, publicRequirements, enclavePublicKey, bidDeadline, finalizeDeadline, deliverDeadline, budget) → auctionId`
  — buyer only. Requires `block.timestamp < bidDeadline < finalizeDeadline < deliverDeadline`, so no
  auction can exist that is undeliverable or unslashable. Pulls the Budget, records the block
  number, emits `AuctionCreated`.
- `commit(auctionId, commitment)` — any address, once, before `bidDeadline`. Pulls the `STAKE`
  constant, 50 USDC. Emits `Committed`.
- `onReport(bytes metadata, bytes report)` — the CRE forwarder only, through the Chainlink receiver
  template. The name belongs to Chainlink and is kept verbatim; everywhere else the word is
  "settlement". It is the only entry a workflow has, so it carries both writes and dispatches on a
  kind: `1` is the claim, `2` is the settlement. An unknown kind reverts.
  - `report` is `abi.encode(uint8 kind, bytes payload)`. The claim payload is
    `abi.encode(bytes32 auctionId)`. The settlement payload is `abi.encode(Settlement)`.
  - Kind `1` requires `Bidding` and `block.timestamp >= bidDeadline`, then moves to `Settling`.
  - Kind `2` requires `Settling`, a matching Policy Hash, a matching Bids Root, a Payout within the
    Budget, and a winner that either committed or is the zero address. Pays, refunds, finalizes.
  - It reads nothing from `metadata`: simulation passes a placeholder workflow id and workflow
    owner. The kind cannot live there either, because `reportId` is `0001` for every report in one
    run. Row V8.
  - `startSettling(auctionId)` is internal, reached only through kind `1`. The `evm@1.0.0`
    capability has one write RPC, `writeReport`, with no calldata field, so a workflow cannot call
    any other function on the receiver. Row V8.
- `supportsInterface(bytes4 id) → bool` — returns `true` for `0x01ffc9a7` and for the `IReceiver`
  interface id `0x805f2132`, and `false` for everything else. The forwarder probes it before every
  settlement. A receiver that answers `true` to `0xffffffff` is skipped: the forwarder calls nothing
  and emits `ReportProcessed(result: false)`, while the workflow still reads `TxStatus.SUCCESS`. The
  auction then sits in `Settling` until `timeoutRefund`. A test asserts the `0xffffffff` answer.
- `submitReceipt(auctionId, receiptHash)` — the winner only, before `deliverDeadline`. Releases its
  Stake.
- `slash(auctionId)` — anyone, after `deliverDeadline` with no Receipt. The Stake goes to the buyer.
- `timeoutRefund(auctionId)` — anyone, from `Created`, `Bidding` or `Settling`, after
  `finalizeDeadline` with no settlement. Refunds the Budget and every Stake. A liveness fallback,
  documented as one.

Three views, because the workflow holds no state of its own:

- `pendingSettlement() → bytes32` — the lowest `auctionId` in `Bidding` with
  `block.timestamp >= bidDeadline`, or `bytes32(0)`. The cron reads this.
- `commitmentsOf(auctionId) → bytes32[]` — arrival order. The Bids Root is built from this set.
- `auctionOf(auctionId) → Auction` — state, buyer, deadlines, Policy Hash, enclave public key,
  Budget, winner, Payout, `receiptHash`, `stakeReleased`, `stakeSlashed`.

Invariants: USDC out never exceeds USDC in, per auction; no payout unless the Policy Hash and the
Bids Root both match; the buyer cannot withdraw between `createAuction` and `Finalized`, except
through `timeoutRefund`; `Finalized` and `Timeout` are terminal.

Tests: the demo table end to end; a wrong Policy Hash rejected; a wrong Bids Root rejected; a claim
report from a non-forwarder rejected; a settlement report before the claim report rejected; an
unknown report kind rejected; `timeoutRefund` before `finalizeDeadline` rejected; deadlines out of
order rejected at creation; the no-winner path; the slash path; the timeout path.

## CRE workflow

- Start from `cre init --template=hello-confidential-workflows-ts`.
- A cron trigger, every 60 seconds in simulation, calls `pendingSettlement()`. On `bytes32(0)`,
  exit.
- Claim the auction with a kind `1` report before any scoring work.
- Inside `handlerInTee`: load the Policy and the enclave private key from secrets; read the
  commitments from the chain; fetch the Sealed Bids with `cre.capabilities.HTTPClient`; decrypt;
  check signatures; check commitments; build the Bids Root; score; return only the Settlement.
- The workflow nodes never read the commitments and never compute the Bids Root.
- Encode the Settlement as a kind `2` report and write it to `SealedAuction`. Two `writeReport`
  calls fit one run and the second sees the state the first committed, so the claim and the
  settlement need no second cron tick. Row V8.
- Save one full `cre workflow simulate` run to `docs/evidence/`.

The relay runs on `http://localhost:8787` and the handler reads it there: in simulation the HTTP
capability runs in the CLI's own process, so localhost resolves, plain HTTP is allowed and no host
allow list exists. Verified in row V13. A deployed workflow cannot reach a developer's machine, so a
deployed demo needs the relay on a public host.

Secrets are environment variables named in `secrets.yaml`, and `cre workflow simulate` needs
`-e .env` to resolve them. One secret holds at most 131,072 bytes, which is the operating system's
`exec` limit rather than a CRE limit. The Policy is 425 characters and the enclave private key
is 44. Verified in row V4.

Never logged outside the enclave section: the Policy, the maximum price, the preferences, the
enclave private key, any decrypted Bid. Grep the logs before committing them.

## Supplier agents

Three processes, one codebase, three rate plans: hotel, stars, distance, base price, refundable,
breakfast, margin.

- On start, call the LiteAPI sandbox for the Public Requirements and pick a real hotel and a real
  rate as the base price, then apply the rate plan. That is the decision logic tied to a real
  signal.
- Build one Bid, sign it, commit with the Stake, post the Sealed Bid. Both before `bidDeadline`.
- On winning: prebook, book with the sandbox payment method, post the Receipt.

Each agent holds a Circle Agent Stack wallet, and that wallet signs the Bid, the `commit` and the
`submitReceipt` calls. This is what the Arc track asks for, so it ships. It is required, not
optional. Two signer implementations sit behind one interface: `createCircleAgentSigner` is the demo
path and `createLocalSigner` is a viem externally owned account, kept so the bid flow and its tests
run without a Circle session. The bid flow never sees the difference.

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
- `POST /confirm` — canonicalize, hash, upload the workflow secrets, call `createAuction` with the
  Budget.
- Privy: the organization wallet signs with `eth_signTransaction` and the requisition service
  broadcasts the signed RLP to `ARC_RPC_URL`. Privy does not broadcast on Arc: `eth_sendTransaction`
  returns `App is not authorized to transact on chain eip155:5042002`.
- Funding takes two signed transactions, so the spend policy needs two `ALLOW` rules. Both read the
  calldata, not just the destination address:
  - `approve(spender, value)` on the USDC ERC-20, with `spender` equal to `SealedAuction`.
  - `createAuction(...)` on `SealedAuction`, with the Budget argument within the signer's ceiling.
- A calldata rule is `field_source: ethereum_calldata` and needs the contract's JSON ABI in the
  condition. A rule on the destination address alone would let any call through, including one that
  approves a different spender.
- Every rule also pins `chain_id` to 5042002 and uses `method: eth_signTransaction`.
- The ceiling is 500 USDC and the demo Budget is 750, so the quorum fires in the video every time. A
  Budget under 500 goes through on the policy alone, which is the path the tests use.
- The ceiling is a per-signer override policy, not a quorum threshold. A quorum threshold is fixed
  and cannot depend on the Budget. The wallet carries two signers: a server authorization key capped
  at the ceiling, and a key quorum of two, travel manager and finance, with no cap. The requisition
  service picks the signer from the Budget. Unverified: the override-policy path is documented and
  has not been run.

## Links

- Confidential Workflows: https://docs.chain.link/cre/concepts/confidential-workflows
- Using them: https://docs.chain.link/cre/guides/workflow/using-confidential-workflows
- The template: https://docs.chain.link/cre-templates/hello-confidential-workflows
- Connect to Arc: https://docs.arc.io/arc/references/connect-to-arc
- Privy: https://docs.privy.io/
- LiteAPI: https://docs.liteapi.travel/reference
