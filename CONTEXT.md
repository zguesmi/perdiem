# Perdiem

Corporate hotel booking where the buyer's selection rules stay private and sealed bids guarantee the
best deal. A buyer states a need in one sentence, suppliers bid blind, and an enclave picks the
winner against a policy nobody else can read. The chain pays.

## Language

### Actors

**Buyer**: The corporate travel desk that owns the Policy and the Payout Cap. One per auction.
_Avoid_: Desk, customer, client

**Supplier**: A party that submits one Bid and stakes USDC behind it. _Avoid_: Seller, vendor, hotel

**Enclave**: The confidential handler inside the Chainlink CRE workflow. The only place the Policy
is readable. _Avoid_: TEE handler, secure worker

### Artifacts

**Intent**: The buyer's need, written as one English sentence. _Avoid_: Prompt, request, query

**Policy**: The structured private ruleset derived from an Intent. Never leaves the buyer except as
a hash and as a workflow secret. _Avoid_: Rules, criteria, preferences object

**Policy Hash**: The keccak256 of the canonically encoded Policy, committed on chain before any Bid
exists.

**Public Requirements**: The subset of the Policy emitted on chain: city, dates, minimum stars, room
type, number of rooms, location, radius, and the trade-down star level. Everything else stays
private.

**Bid**: One supplier's priced offer: hotel, stars, distance, price, and its attributes. _Avoid_:
Offer, quote, proposal

**Bid Commitment**: The keccak256 that binds a Bid on chain. Placed before the bid deadline, with
the Stake. _Avoid_: Commitment hash, sealed hash

**Sealed Bid**: The Bid, its salt and its signature, encrypted to the enclave's public key and
stored at the relay. _Avoid_: Envelope, blob, ciphertext

**Bids Root**: The keccak256 over every on-chain Bid Commitment for an auction, sorted. Built inside
the enclave, over all commitments, including any whose Sealed Bid never arrived.

**Settlement**: What the enclave reports: the auction, the winner, the payout, the Policy Hash, the
Bids Root and the booking id. _Avoid_: Report, result, outcome

**Booking Proof**: The booking id the enclave reads back from the supplier's API after booking the
winning bid. It travels inside the Settlement, and the contract refuses to pay a winner without one.
_Avoid_: Receipt, confirmation, voucher

**Booking Credentials**: The supplier's own API base URL and key, sealed inside its Sealed Bid
envelope and read by nobody but the enclave. _Avoid_: Token, secret, credentials

### Money

**Payout Cap**: The USDC the buyer locks when the auction is created. It bounds the Payout and
nothing else. Deliberately padded above the maximum price, so the ceiling cannot be read off the
chain, and named so that nobody reads it as the price the buyer will pay. _Avoid_: Budget, escrow
amount, deposit, funds

**Payout**: The USDC the winner receives. First price: exactly what the winning Bid asked for.
_Avoid_: Amount, award, price paid

**Stake**: The USDC a supplier locks when committing a Bid. It binds the commitment to a real
supplier, and every Stake comes back at settlement. _Avoid_: Bond, deposit, collateral

**Escrow**: The custody role the `SealedAuction` contract plays while it holds the Payout Cap and
the Stakes. Not a separate contract.

### Scoring rules

**Eligible**: A Bid that satisfies every hard requirement: city, dates, room type, room count,
distance, price ceiling, and either the minimum stars or the Trade-Down. _Avoid_: Feasible, valid,
qualifying

**Trade-Down**: The rule that accepts a lower star level in exchange for a required discount against
the cheapest Eligible bid at the minimum stars. _Avoid_: Fallback, downgrade, second tier

**Preference Bonus**: Score points a Bid earns for an attribute the buyer values. Denominated in
USDC minor units so it is comparable with price, but never paid to anyone. The attribute implies
what the number means: a `refundable` bonus is worth that much on this trip, and so is
`breakfastIncluded`. _Avoid_: Credit, uplift, perk value

### Services

**Requisition**: The buyer's service. Turns an Intent into a Policy, gets the spend approved through
Privy, and funds the auction. _Avoid_: Desk, backend, API

**Relay**: The blind store for Sealed Bids. Holds ciphertext, serves the enclave, and can read
nothing.

**Workflow**: The Chainlink CRE workflow that claims a ready auction, scores it inside the Enclave,
and writes the Settlement to the chain.
