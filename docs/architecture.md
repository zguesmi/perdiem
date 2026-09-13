# Architecture

Who talks to whom, and in what order. The protocol itself is in `docs/spec.md`.

## Components

![Components](architecture-components.png)

```mermaid
flowchart TB
  buyer["Buyer"]
  purchaser["purchaser service"]
  agents["supplier agents x3"]
  relay[("relay")]
  auction["SealedAuction on Arc"]
  enclave[["Enclave, in the CRE workflow"]]
  hotel["Supplier booking API"]

  buyer -->|"1 one sentence"| purchaser
  purchaser -->|"2 sealed policy"| relay
  agents -->|"3 sealed bid"| relay
  purchaser -->|"4 createAuction, Privy signs"| auction
  agents -->|"5 commitment and stake"| auction
  relay -->|"6 policy and bids"| enclave
  auction -->|"7 pendingSettlement"| enclave
  enclave -->|"8 book"| hotel
  enclave -->|"9 settlement"| auction
```

- The booking arrow runs from the Enclave, not from an agent. An agent stops at `bidDeadline`.
- The relay stores bytes. It holds no key, so it never reads a policy or a bid.
- Only the Enclave holds the enclave private key, so only the Enclave opens the sealed policy and
  the sealed bids.

## Order

![Order](architecture-sequence.png)

```mermaid
sequenceDiagram
  participant B as Buyer
  participant P as purchaser
  participant R as relay
  participant S as supplier agent
  participant C as SealedAuction
  participant E as Enclave
  participant H as Booking API

  B->>P: intent, one sentence
  P->>B: policy and summary
  B->>P: confirm
  P->>R: PUT sealed policy
  P->>C: createAuction, pulls the payout cap
  C-->>S: AuctionCreated, TermsPublished
  S->>C: commit, pulls the stake
  S->>R: PUT sealed bid
  Note over C: bidDeadline
  E->>C: claim, action 1
  E->>R: GET sealed policy and sealed bids
  E->>E: verify, score, pick the winner
  E->>H: book, then read the booking id back
  E->>C: settlement, action 2
  C->>B: refund
  C-->>S: payout to the winner, every stake back
```
