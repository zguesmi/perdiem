# Seal the Policy to the enclave and serve it from the relay

Status: ready-for-agent Type: task Blocked by:
../verification/issues/13-can-the-enclave-reach-the-relay.md

Today the Policy is a workflow secret. That has three costs:

- One secret id carries one Policy, so a second open auction scores against the first one's Policy.
- Writing it per auction needs `cre secrets create` and deploy access. Never run: row V4.
- A secret arrives unchecked. The enclave cannot tell the committed Policy from a swapped one.

Sealing it to the enclave public key and putting it in the relay fixes all three. The relay already
holds ciphertext the enclave alone can open, and the handler already reads the relay over HTTP from
inside `handlerInTee`: row V13.

The Policy Hash is on chain before any bid exists. So the enclave fetches by that hash and checks
what comes back against it. A swapped Policy fails the check; a Vault DON secret has no such check.

## The shape

- Key by Policy Hash, not by `auctionId`. `auctionId` commits to deadlines derived from
  `block.timestamp`, so the buyer cannot compute it before `createAuction` mines. The Policy Hash is
  known before it, which keeps the upload ahead of the auction.
- `PUT /policies/{policyHash}` and `GET /policies/{policyHash}` on the relay. Raw ciphertext body,
  first write wins with `409`, `413` over the size cap, `404` on an unknown hash. The relay parses
  none of it, exactly as it does for a sealed bid.
- One envelope scheme, two domains. `shared/sealed-bid.ts` binds its HKDF `info` to
  `"perdiem/sealed-bid/v1" || auctionId`. The Policy envelope binds to
  `"perdiem/sealed-policy/v1" || policyHash`, so neither ciphertext opens as the other.
- `purchaser/` seals and uploads in `POST /confirm`, before `createAuction`. It no longer uploads a
  workflow secret.
- The enclave fetches by the `policyHash` it read from the chain, opens the envelope, and checks
  `hashPolicy(policy) === policyHash`. Any failure means no settlement, and the auction refunds
  through `timeoutRefund`. That read is ticket 30, not this one.
- `secrets.yaml` keeps `ENCLAVE_PRIVATE_KEY` alone. That one is per deployment, which is what a
  workflow secret fits.

What it costs: anyone can fetch the ciphertext and count the policies. No maximum price and no
preference leaks, because only the enclave holds the private key. Same exposure the sealed bids
already have, and the same hardening applies.

A buyer that creates an auction and never uploads gets no settlement. That is the relay-is-down path
and it ends in the same refund.

## Scope boundary

The producer half only: the envelope in `shared/`, the two relay routes, the upload in
`POST /confirm`, the secret that goes away, and the documents. Ticket 30 owns the enclave read and
the hash check, and it is blocked by this one. Nothing in `workflow-cre/` changes here, so this
ticket runs beside ticket 06.

## Acceptance criteria

- [ ] An ADR records why the Policy travels through the relay rather than the Vault DON, and why it
      is keyed by Policy Hash.
- [ ] `shared/` seals and opens a Policy envelope under its own domain, with a test that a bid
      envelope fails to open as a Policy and the reverse.
- [ ] A test shows a Policy whose bytes changed in flight fails `hashPolicy` against the committed
      hash.
- [ ] The relay serves both routes, with tests for first write wins, the size cap and the unknown
      hash.
- [ ] `POST /confirm` seals and uploads before `createAuction`, and uploads no workflow secret.
- [ ] `secrets.yaml` names only `ENCLAVE_PRIVATE_KEY`, and `POLICY` leaves both `.env` examples.
- [ ] `docs/spec.md` states the new path in place of the workflow secret.

## Comments

## Dev review

Not reviewed yet.
