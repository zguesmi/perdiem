# SPEC — Sealed Desk: sealed-bid hotel booking with a private buyer policy


## How to use this file

- Read all of this file before you write code.
- Put a `CLAUDE.md` at the repo root that points to this file and to `docs/decisions.md`.
- Do section "VERIFY before building" first. Write the answers to `docs/decisions.md`. Do not build on an unverified assumption.
- When a task is ambiguous, pick the option that ships the 2-minute demo. Note the choice in `docs/decisions.md`.
- Do not add features that are not in this file. Section 2 lists what is cut.

## Pitch

A corporate travel desk states a booking need in one English sentence. An LLM turns the sentence into a structured policy: hard requirements, weighted preferences, and a maximum price. The buyer confirms the policy once. The policy hash is committed on chain before any offer exists. The buyer locks USDC in escrow on Arc. The policy is sealed inside a Chainlink CRE confidential workflow (TEE). Hotel supplier agents each submit one sealed offer. The enclave scores the offers against the private policy and reports only the winner and the price. The contract pays the winner, refunds the remainder, and holds the winner's bond until a booking receipt arrives.

Demo money shot: three offers arrive. The cheapest one loses. The second cheapest wins. The buyer pays more than the cheapest on purpose, for what the private policy values. Then: escrow in, winner paid, remainder refunded, all on chain.

Tagline: "Commit the policy. Score in the enclave. The chain pays."

## Goals and non-goals

Goals (all required for the demo):
1. Policy committed on chain before bids open. Verifiable by block order.
2. Policy processed only inside the CRE TEE handler. Never on Workflow DON nodes.
3. Sealed, single-shot offers. No seller sees another seller's offer before scoring.
4. Settlement enforced by contract: payout ≤ escrow, payout only to the enclave-reported winner, report bound to the committed policy hash and to the on-chain offer commitments.
5. Winner delivers a real LiteAPI sandbox booking and posts a receipt hash. Bond slashed on silence. Check if we can do the booking inside the enclave directly.
6. Buyer funding goes through a Privy organization wallet with a spend policy and a quorum approval above a ceiling.
7. Working one-page UI, backend, architecture diagram, README, 2-minute video.

Non-goals (cut, do not build):
- Multiple buyers. One buyer, one workflow.
- Reputation, seller identity registry, ENS, The Graph, Hedera, Ledger.
- Second-score or Vickrey pricing. First-price only.
- Iterative bidding or score feedback.
- Production key management. Demo keys in `.env`.
- Real PII. Use LiteAPI sandbox test guest data only.
- Mainnet anything.

## Architecture

Components:
1. `contracts/` — Solidity, Foundry/Hardhat. `SealedAuction.sol` on Arc testnet (chain id 5042002).
2. `workflow/` — CRE workflow, TypeScript SDK. One handler with a TEE section.
3. `agents/` — three supplier agents (Node/TypeScript). One wraps LiteAPI sandbox.
4. `desk/` — buyer backend: intent parsing, policy commit, Privy wallet, escrow funding.
5. `relay/` — small HTTP service that receives sealed offers as opaque ciphertext and serves them to the enclave. It cannot read what it stores.
6. `web/` — one-page UI (Vite + React + viem). Reads chain state and relay state.
7. `docs/` — decisions, evidence, diagram, demo script, AI prompts.

Data flow (the bond part will be the last thing to implement):
1. Buyer types one sentence in `web/`. `desk/` calls the LLM once. Output: Policy JSON (section "Policy JSON"). Zod-validate. Reject on schema failure.
2. Buyer confirms the JSON in the UI. `desk/` computes `policyHash = keccak256(canonicalJSON(policy))`.
3. `desk/` stores the policy and the enclave X25519 private key as workflow secrets (CRE secrets, simulation mode) and calls `createAuction(policyHash, publicRequirements, enclavePublicKey, bidDeadline, settleDeadline, deliverDeadline, escrowAmount)`. USDC is pulled in the same call, so the auction is funded the moment it exists.
4. Privy: the desk's org wallet signs that `createAuction` call. If `escrowAmount > ceiling`, the Privy key quorum must approve.
5. Auction state is `Created`. The first `commit` moves it to `Bidding`. Public: `publicRequirements` (city, dates, minimum stars, location, radius, room type, number of rooms, fallback stars) and `enclavePublicKey`. Private: soft requirements, required discount percentage, maximum price.
6. Each supplier agent builds one Offer (section "Offer") and signs it (EIP-712). In one beat, before `bidDeadline`, it calls `commit(auctionId, keccak256(offer, salt))` with the bond **and** POSTs `{offer, salt, signature}` sealed to `enclavePublicKey` to `relay/`. Relay stores the blob, serves only to the workflow, and cannot decrypt it.
7. There is no separate reveal phase. The commitment binds the offer and the envelope hides it, so nothing is gained by making agents wait. See "Why there is no reveal phase" below.
8. After `bidDeadline`: the CRE workflow runs (cron trigger, polls `auctionReadyForScoring`) and calls `startSettling(auctionId)`, moving the auction to `Settling`. DON part reads public commitments from chain. TEE part fetches the sealed offers from relay, fetches the policy secret and the enclave private key, decrypts each blob, verifies the EIP-712 signature, verifies each offer against its commitment, filters feasibility, scores, picks winner, rebuilds `bidsRoot`.
9. TEE part returns only `{auctionId, winner, amount, policyHash, bidsRoot}` to the DON. DON writes the report to `SealedAuction` on Arc testnet.
10. Contract checks: `policyHash == stored`, `bidsRoot == keccak256(sorted commitments)`, `amount <= escrow`. Pays winner. Refunds buyer. Refunds losers' bonds. State → `Finalized`. Starts the delivery window.
11. Winner agent books via LiteAPI sandbox (search → prebook → book). Calls `submitReceipt(auctionId, keccak256(bookingId))`. Contract releases the winner's bond.
12. If no receipt before `deliverDeadline`: anyone calls `slash(auctionId)`. Bond goes to the buyer.

## Data schemas

### Policy JSON (private; only the hash goes on chain)

```json
{
  "version": 1,
  "currency": "USDC",
  "maxPrice": 520,
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
      "latitude": 48.8809,
      "longitude": 2.3553
    },
    "radiusKm": 2
  },
  "fallback": {
    "stars": 3,
    "requiredDiscountPercentage": 30
  },
  "softRequirements": [
    { "attr": "refundable", "creditPercentageOfPrice": 12 },
    { "attr": "breakfast", "creditPerNight": 20 }
  ]
}
```

Rules:
- Amounts are integers in USDC minor units (6 decimals) once inside code. JSON above uses whole units for readability; convert at the boundary.
- Canonical JSON: sorted keys, no whitespace, UTF-8. One function, used by desk and workflow. Test that both produce the same hash.

Public requirements (emitted in `AuctionCreated`): `city, checkin, checkout, minStars, roomType, numberOfRooms, location, radiusKm, fallback.stars`. Not emitted: `maxPrice, fallback.requiredDiscountPercentage, softRequirements`.

### Offer (signed by supplier, EIP-712)

```json
{
  "auctionId": "0x…",
  "supplier": "0x…",
  "hotelId": "lp1a2b3",
  "hotelName": "Awesome Hotel",
  "stars": 4,
  "distanceKm": 1,
  "price": 440,
  "refundable": true,
  "breakfast": true,
  "roomType": "double",
  "numberOfRooms": 1,
  "salt": "0x…32 bytes"
}
```

Commitment: `keccak256(abi.encode(structHash(offer), salt))`. Keep `salt` out of `structHash`.

### Sealed offer envelope (agent → relay → enclave)

The relay is a plain HTTP service on the buyer's side. It must never hold a readable offer, because a readable offer also leaks the `salt`, and a leaked `salt` unseals the on-chain commitment: the offer space is small (an integer price in a narrow band, three booleans, a handful of star values), so `keccak256` over it brute-forces in seconds without the salt.

So agents encrypt to the enclave:

- **Key**: one X25519 keypair per deployment. The private half is a CRE workflow secret, loaded **only** inside `handlerInTee`, exactly like the policy. The public half, `enclavePublicKey`, is a `createAuction` argument and is emitted in `AuctionCreated`.
- **Envelope**: the agent seals the whole payload — `{offer, salt, signature}` — with a sealed box (X25519 + XSalsa20-Poly1305, or HPKE if the runtime prefers it). The `salt` goes **inside** the ciphertext. Nothing but the ciphertext and the supplier address leaves the agent.
- **Relay**: stores one blob per `(auctionId, supplier)`. Size-capped. Write-only bearer token for agents, read token for the workflow. The relay cannot verify the signature, so it cannot filter spam beyond the one-blob-per-supplier rule; that is fine, the TEE drops anything that fails.
- **TEE**: loads the private key from secrets, decrypts, verifies the EIP-712 signature, then verifies the commitment. Any failure at any step drops that offer and logs a count only.

This needs no enclave attestation. It reuses the secret-loading path the policy already uses, so the cost is one more secret and roughly 20 lines in the agent. See "VERIFY before building" item 3.

What a relay leak now costs an attacker: nothing readable. What it still allows: dropping a blob. That is what `bidsRoot` catches.

#### Why there is no reveal phase

A classic sealed-bid auction splits commit from reveal because reveals are public: reveal early and later bidders read your price and undercut it. Neither half of that applies here.

- The commitment binds the offer. An agent cannot change its price after committing, whenever the blob arrives.
- The envelope hides the offer. The relay holds ciphertext, so a leak during the bidding window reveals nothing to anyone.
- Nothing is published between `bidDeadline` and scoring, so a waiting agent learns nothing by waiting.

So the commit and the sealed POST happen in the same beat, both before `bidDeadline`. One deadline, no agent-side timer, and no dead minute in the demo video.

`commit()` still earns its place, for three reasons that have nothing to do with phasing: it pulls the bond, it makes relay tampering detectable, and it is the on-chain set that `bidsRoot` binds the report to. A relay-only design has none of those.

**This depends on "VERIFY before building" item 3.** If the TEE cannot decrypt in-enclave and you fall back to plaintext at the relay, the envelope stops hiding anything and a relay leak during bidding becomes exploitable — a late agent could read a rival's price and undercut it before `bidDeadline`. In that case, and only in that case, reintroduce a `revealDeadline` after `bidDeadline` and hold the POSTs until commits are closed.

### Settlement report (enclave → DON → chain)

```solidity
struct Settlement {
  bytes32 auctionId;
  address winner;
  uint256 amount;      // USDC minor units, first price
  bytes32 policyHash;
  bytes32 bidsRoot;  // keccak256(abi.encodePacked(sorted commitments))
}
```

If no offer is feasible: `winner = address(0), amount = 0`. Contract refunds escrow and all bonds. The buyer reveals the policy off chain in the UI so the demo can show the maximum price was real. (Anti-harvest measure; optional in video.)

`bidsRoot` is what binds the report to the exact set of on-chain commitments, so no offer can be dropped or swapped between the chain and the enclave. It is only meaningful if the **TEE** builds it, not the DON:
- Preferred: the TEE reads the commitments from chain itself (EVM read inside `handlerInTee`) and hashes the sorted set. See "VERIFY before building" item 2.
- Fallback if EVM read is not available inside the TEE: the DON passes the commitments in, the TEE recomputes `keccak256(abi.encode(structHash(offer), salt))` for every sealed offer and asserts each one is present in that set, then hashes the sorted set. The guarantee degrades to "the DON did not feed the same lie to both the TEE and the contract". Record which path you took in `docs/decisions.md`.

Either way, build the root over **all** on-chain commitments, including any committer whose sealed offer never arrived or failed to decrypt. Build it over the offers you successfully scored and one missing blob makes the root mismatch, which drops a perfectly good auction into `timeoutRefund`.

### Receipt

`keccak256(bytes(liteApiBookingId))`. The UI shows the plain `bookingId` and the LiteAPI sandbox response next to the on-chain hash.

## Scoring (inside the TEE, deterministic integer math)

Input: policy P, offers O[] with verified commitments.

1. Decrypt the envelope, verify the EIP-712 signature, then verify `commitment(offer, salt) == onChainCommitment[supplier]`. Drop any failure. Log counts only.
2. Feasibility, per offer:
   - `city`, `checkin`, `checkout` equal to `P.hardRequirements`.
   - `roomType == P.hardRequirements.roomType` and `numberOfRooms == P.hardRequirements.numberOfRooms`.
   - `distanceKm <= P.hardRequirements.radiusKm`.
   - `price <= P.maxPrice`.
   - `stars >= P.hardRequirements.minStars`, OR (`stars == P.fallback.stars` AND `price * 100 <= lowestFeasiblePriceAtMinStars * (100 - P.fallback.requiredDiscountPercentage)`). Compute `lowestFeasiblePriceAtMinStars` first over offers that pass all other checks with `stars >= minStars`. If none, a fallback-star offer is feasible if `price <= P.maxPrice`.
3. Score, per feasible offer:
   - `credit = 0`
   - if `refundable`: `credit += price * creditPercentageOfPrice / 100`
   - if `breakfast`: `credit += creditPerNight * nights`
   - `score = (P.maxPrice - price) + credit`
4. Winner = max score. Tie-break: lower `price`, then lower `supplier` address.
5. Output Settlement with `amount = winner.price`.

Demo offers (must produce "cheapest loses, second cheapest wins"). All are `double`, 1 room, `maxPrice` 520, 2 nights:
- A: 3★, refundable, 0.5 km, 330. Fails the fallback rule: 330 > 70% of 400.
- B: 4★, non-refundable, no breakfast, 0.7 km, 400. Score 120.
- C: 4★, refundable, breakfast, 1.0 km, 440. Score 80 + 52 + 40 = 172. Wins.
- Buyer pays 440. Refund 80. Bonds: A and B refunded at settlement; C released on receipt.

Unit-test this table in `workflow/` before you touch CRE.

## Contract: `SealedAuction.sol`

State machine per auction:

```
Created   → funds escrowed at creation, no commit yet
Bidding   → commit on chain + sealed offer to relay, both until bidDeadline
Settling  → CRE workflow has claimed the auction and is scoring it
Finalized → terminal; winner or no winner
Timeout   → terminal; no report by settleDeadline, everything refunded
```

- `Created → Bidding` on the first `commit`. No extra transaction.
- `Bidding` has one deadline. The on-chain `commit` and the sealed POST to `relay/` both happen before `bidDeadline`, in either order, normally back to back. The contract never sees the POST.
- `Bidding → Settling` is driven by the **CRE workflow**, not by the clock: the workflow calls `startSettling(auctionId)`. `auctionReadyForScoring()` returns true once `block.timestamp >= bidDeadline` and the state is still `Bidding`.
  - Why not time-based: a time-based flip means the contract cannot tell "the workflow never ran" from "the workflow ran and its report was rejected". With an explicit claim, `Bidding` past `bidDeadline` means the workflow never picked the auction up, and `Settling` means it did. That is the difference between debugging the relay and debugging the report during the demo.
  - Cost: one extra on-chain write per auction, from the CRE forwarder.
  - `[VERIFY]` whether one workflow run can issue two `writeReport` calls (claim, then settle). If not, split them across two cron ticks and drop the simulation cron to 20 s so the demo does not stall.
- `Settling → Finalized` on a valid `onReport`, with or without a winner.
- `Bidding → Timeout` or `Settling → Timeout` on `timeoutRefund`, once past `settleDeadline`.
  - `settleDeadline` exists to stop a race. If the refund path opened at `bidDeadline`, any losing bidder could call `timeoutRefund` a second later and kill the auction before the enclave ever ran. The gap has to cover the cron interval plus `startSettling` plus scoring plus `onReport` — a few minutes, not a day. Set it to `bidDeadline + 3 min` for the demo.
- Delivery is **not** a state. After `Finalized`, the receipt and the winner's bond are fields on the auction: `receiptHash`, `bondReleased`, `bondSlashed`.

Functions:
- `createAuction(bytes32 policyHash, PublicRequirements publicRequirements, bytes32 enclavePublicKey, uint64 bidDeadline, uint64 settleDeadline, uint64 deliverDeadline, uint256 escrowAmount) returns (bytes32 auctionId)` — buyer only. `enclavePublicKey` is the X25519 public half agents seal their offers to. Requires `block.timestamp < bidDeadline < settleDeadline < deliverDeadline`; revert otherwise, so no auction can exist that is undeliverable or unslashable. USDC `transferFrom` buyer for `escrowAmount` in the same call. Emits `AuctionCreated` with the public requirements and `enclavePublicKey`. Records `block.number` as `policyCommittedAt`. State → `Created`. The buyer cannot withdraw after this call except via `timeoutRefund`.
- `commit(bytes32 auctionId, bytes32 commitment)` — any address, once, before `bidDeadline`. Pulls `BOND` USDC (constant, 50 USDC). Emits `Committed`. State → `Bidding`.
- `startSettling(bytes32 auctionId)` — CRE forwarder only. Requires state `Bidding` and `block.timestamp >= bidDeadline`. State → `Settling`. Emits `SettlingStarted`.
- `onReport(bytes metadata, bytes report)` — called only by the CRE forwarder (use Chainlink `ReceiverTemplate`, forwarder address from the Arc testnet forwarder directory). Decodes `Settlement`. Requires: state `Settling`; `policyHash` match; `bidsRoot` match; `amount <= escrow`; `winner` has a commitment or is `address(0)`. Pays winner, refunds buyer remainder, refunds losers' bonds. State → `Finalized`.
- `submitReceipt(bytes32 auctionId, bytes32 receiptHash)` — winner only, state `Finalized`, before `deliverDeadline`. Releases the winner's bond. Sets `receiptHash` and `bondReleased`.
- `slash(bytes32 auctionId)` — anyone, state `Finalized`, after `deliverDeadline` with no receipt. Bond → buyer. Sets `bondSlashed`.
- `timeoutRefund(bytes32 auctionId)` — anyone, state `Bidding` or `Settling`, after `settleDeadline` with no report. Refunds escrow and all bonds. State → `Timeout`. Liveness escape hatch. Document it as such.

Invariants:
- Sum of USDC out ≤ sum of USDC in, per auction.
- No payout unless `policyHash` and `bidsRoot` match.
- Buyer cannot withdraw between `createAuction` and `Finalized` except via `timeoutRefund`.
- `Finalized` and `Timeout` are terminal. No transition out of either.

Tests: happy path with the demo table above; wrong `policyHash` rejected; wrong `bidsRoot` rejected; `startSettling` from a non-forwarder address rejected; `onReport` before `startSettling` rejected; `timeoutRefund` before `settleDeadline` rejected; out-of-order deadlines rejected at `createAuction`; no-winner path; slash path; timeout path.

USDC on Arc testnet: address `[VERIFY]`. Decimals `[VERIFY]` — Arc native gas is USDC with 18 decimals; the ERC-20 used for escrow may differ. Do not hardcode 6 before checking.

## CRE workflow (`workflow/`)

- Start from the official template: `cre init --template=hello-confidential-workflows-ts`.
- Trigger: cron, every 60 s in simulation (20 s if the claim and the settle have to land on separate ticks). Handler reads `auctionReadyForScoring()` from the contract (DON side, EVM read). If none, exit.
- DON side: call `startSettling(auctionId)` to claim the auction before doing any scoring work.
- DON side: read commitments for the auction. Pass `auctionId, commitments[]` into the TEE handler. The DON does **not** compute `bidsRoot`.
- TEE side (`handlerInTee`):
  - Fetch the policy and the enclave X25519 private key from secrets. Simulation: CRE secrets file. Deployed: Vault DON.
  - Fetch the sealed offers from `relay/` with confidential HTTP, using a bearer token secret. Decrypt each blob with the enclave private key, then verify the EIP-712 signature. Drop anything that fails to decrypt or verify; log the count only. `[VERIFY]` that confidential HTTP is callable inside the TEE handler in simulation. Fallback: plain HTTP inside the TEE handler; note the weaker guarantee in `docs/decisions.md`.
  - Build `bidsRoot` per the rule in "Settlement report". Run the Scoring section. Return only the Settlement struct.
- DON side: encode Settlement, `writeReport` to `SealedAuction` on `arc-testnet` (TS SDK ≥ v1.3.1, CLI ≥ v1.0.7).
- Evidence: save `cre workflow simulate` output for one full run to `docs/evidence/simulate-<date>.log`. Screen-record it for the video.

Must not: log the policy, the maximum price, the soft requirements, the enclave private key, or any decrypted offer outside the TEE section. Grep the logs before you commit them.

## Supplier agents (`agents/`)

Three processes, same code, different config:
- `rate plan`: hotelId, stars, distance in km, base price, refundable, breakfast, margin.
- Signal: on start, call LiteAPI sandbox `hotels` + `rates` for the public requirements and pick a real hotelId and a real rate as the base price. Then apply the rate plan. This is the "decision logic tied to real signals" for the Arc track.
- Behavior: read `AuctionCreated`, build one Offer, sign, then in one beat `commit` with the bond and POST `{offer, salt, signature}` sealed to `enclavePublicKey` to `relay/`. Both before `bidDeadline`. No timer, no second phase.
- Winner behavior: on `Finalized` with `winner == self`: LiteAPI `prebook` then `book` with sandbox payment method. Then `submitReceipt(keccak256(bookingId))`. Print the booking response.
- Agents must not read the relay. Enforce with the bearer token: agents have write-only tokens; the workflow has the read token.

LiteAPI: sandbox key comes instantly on signup. Flow is search → prebook → book with a test payment. Docs: https://docs.liteapi.travel/reference

## Buyer desk (`desk/`)

- `POST /intent` → one LLM call with a fixed system prompt and JSON schema. Store the prompt at `docs/ai/intent-prompt.md`. Validate with Zod. Return the Policy JSON. No retries beyond 1.
- `POST /confirm` → canonicalize, hash, upload secret to CRE (simulation secrets), call `createAuction` with the escrow amount. Privy: org wallet transaction. Policy: allow USDC transfers only to `SealedAuction`, max per tx = ceiling. Above ceiling: key quorum (2 signers: travel manager, finance). Show both approvals in the UI.
- Privy details to `[VERIFY]` in section "VERIFY before building" before coding this.

## UI (`web/`)

One page, five panels, top to bottom. Every panel shows a tx hash or a log line.
1. Intent: text box, "Parse". Shows Policy JSON. "Confirm & commit" → shows `policyHash`, tx, block number.
2. Funding: amount, ceiling, Privy approval state, `createAuction` tx.
3. Offers: three cards. Show only "committed" + commitment hash until settlement. After settlement, show all three with price and attributes so the audience sees why the cheapest lost.
4. Enclave: live tail of the simulation log. Show the line "TEE: policy loaded" and "TEE: 3 sealed offers decrypted and verified". Never show the soft requirements.
5. Settlement: winner, amount, refund tx, bond refunds, receipt hash, LiteAPI booking response.

No design work beyond a clean default theme. No mobile layout.

## Demo script (2 minutes)

- 0:00 The sentence on screen. "Paris, 12–14 Oct, one double room, 4★ minimum, within 2 km of Gare du Nord. Free cancellation is worth up to 12% more. Breakfast worth up to €20 a night. I would accept 3★ if at least 30% cheaper."
- 0:15 Policy JSON, confirm, commit tx, block number. "Committed before any offer exists."
- 0:30 Privy funding with quorum approval. "Human before irreversible."
- 0:45 Three commitments arrive on chain, three sealed blobs arrive at the relay. Hashes and ciphertext only.
- 0:55 Simulation log: policy loaded in the TEE, three sealed offers decrypted and verified, scoring done. "The relay never saw a price." "This is a CRE simulation. Confidential Workflows is in private beta."
- 1:10 Settlement tx. Winner C at 440. Refund 80. "The cheapest lost. The second cheapest won."
- 1:25 Show the three offers. Show why: A failed the 30% rule, B lost on cancellation and breakfast.
- 1:40 Winner books in LiteAPI sandbox. Receipt hash on chain. Bond released.
- 1:50 One sentence on prior art: "Name Your Own Price had one dimension and the platform saw the bid. Here the scoring rule is private from the platform too."
- 2:00 End card: repo, diagram.

## Build order and done criteria

Day 0 (today): section "VERIFY before building". Sign up: CRE, Privy, LiteAPI, Arc faucet. Request CRE confidential beta. Repo skeleton, CI for Foundry tests.
Day 1–2: `contracts/` complete with the tests listed above. Deployed on Arc testnet. Done: all tests green, addresses in `docs/decisions.md`.
Day 3: `workflow/` scoring unit tests green (demo table). CRE simulation runs end to end and writes a report to Arc testnet. Done: `docs/evidence/` has a log.
Day 4: `agents/` and `relay/`. Three commits, three sealed blobs at the relay, one LiteAPI sandbox booking, receipt on chain. Done: full flow runs from a single script `scripts/demo.sh`.
Day 5: `desk/` with Privy funding and quorum. Done: `createAuction` tx originates from the Privy org wallet.
Day 6: `web/` five panels. Architecture diagram (`docs/architecture.md` with Mermaid, export PNG). README.
Day 7: video, submission text for 3 partners, final `docs/evidence/`.

If behind by day 4: cut Privy quorum to policy-only. If behind by day 5: cut the UI to a read-only status page and drive the demo from `scripts/demo.sh`.

## VERIFY before building (write answers to `docs/decisions.md`)

1. CRE: does `cre workflow simulate` broadcast a real write to Arc testnet with the simulation forwarder? Which forwarder address?
2. CRE: can confidential HTTP be called inside `handlerInTee` in simulation? Can EVM read? The EVM read answer decides which `bidsRoot` path you take.
3. CRE: can `handlerInTee` load an X25519 private key from secrets and decrypt a sealed box in-enclave? Confirm the TEE runtime exposes crypto beyond hashing, and which library is available. If it does not, fall back to plaintext at the relay behind the bearer token, reintroduce a `revealDeadline` (see "Why there is no reveal phase"), and record both in `docs/decisions.md`.
4. CRE: how are secrets supplied in simulation, and what is the size limit? The policy JSON plus the enclave private key must fit.
5. Arc testnet: USDC ERC-20 address and decimals. Faucet amounts and rate limit.
6. Privy: do server wallets sign on chain id 5042002? Do policy rules accept a custom chain id? Are key quorums available on the free tier?
7. Circle Agent Stack: can it create a wallet on Arc testnet in under half a day? If not, EOAs.
8. CRE: can one workflow run issue two `writeReport` calls to the same contract (`startSettling`, then `onReport`)? If not, the claim and the settle go on separate cron ticks.
9. LiteAPI sandbox: confirm `prebook` and `book` return a stable `bookingId`. Confirm the sandbox payment method name.
10. Chainlink Confidential Workflows beta: request sent, response date.

## Links

- Chainlink Confidential Workflows concept: https://docs.chain.link/cre/concepts/confidential-workflows
- Chainlink Confidential Workflows guide: https://docs.chain.link/cre/guides/workflow/using-confidential-workflows
- Chainlink CRE supported networks: https://docs.chain.link/cre/supported-networks-ts
- Chainlink template: https://docs.chain.link/cre-templates/hello-confidential-workflows
- Arc connect: https://docs.arc.io/arc/references/connect-to-arc
- Circle Agent Stack starter kits: https://github.com/circlefin/agent-stack-starter-kits
- Privy docs: https://docs.privy.io/
- LiteAPI reference: https://docs.liteapi.travel/reference
- LiteAPI booking step: https://docs.liteapi.travel/docs/step-4-booking-a-room
