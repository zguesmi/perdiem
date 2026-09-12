# The policy reaches the enclave through the relay, sealed, keyed by its hash

The Policy used to be a workflow secret: one `POLICY` id in `secrets.yaml`, released by the Vault
DON into the enclave. That cost three things.

- One secret id carries one Policy, so a second open auction scores against the first one's Policy.
- Writing it per auction needs `cre secrets create` and deploy access. Never run: row V4.
- A secret arrives unchecked. The enclave cannot tell the committed Policy from a swapped one.

So the buyer seals the Policy to the enclave public key and puts the ciphertext at the relay. The
relay already holds ciphertext the enclave alone can open, and `handlerInTee` already reads it over
HTTP: row V13. The enclave fetches the Policy, opens it, and checks `hashPolicy(policy)` against the
hash the chain carries. A swapped Policy fails that check; a Vault DON secret has no such check.

## Keyed by the Policy Hash, not the auction identifier

`auctionId` hashes the auction record, and that record carries deadlines the contract derives from
`block.timestamp`. The buyer cannot compute it before `createAuction` mines. The Policy Hash is
known before it, so keying by the hash keeps the upload ahead of the auction it belongs to.

## One scheme, two domains

`shared/envelope.ts` holds the X25519 and XChaCha20-Poly1305 scheme of
`docs/adr/0005-sealed-bid-envelope-scheme.md`. The HKDF `info` names the domain and the identifier
it binds to: `"perdiem/sealed-bid/v1" || auctionId` for a bid,
`"perdiem/sealed-policy/v1" || policyHash` for a Policy. Neither ciphertext opens as the other.

## Consequences

`secrets.yaml` keeps `ENCLAVE_PRIVATE_KEY` alone, which is per deployment and is what a workflow
secret fits. `POLICY` leaves both environment examples.

The purchaser service uploads before it funds. An upload that fails answers the buyer with 502 and
opens no auction, because an auction whose Policy the enclave cannot fetch pays nobody and refunds
on timeout.

A `409` counts as uploaded. The Policy Hash is deterministic, so a confirm retried after a funding
failure re-derives it, and the relay is first-write-wins: refusing there would lock the buyer out of
their own Policy until the relay restarts. Cost: a hash somebody wrote to first yields an auction
that refunds on timeout rather than a 502 the buyer sees at once.

Anyone can fetch the ciphertext and count the policies. No maximum price and no preference leaks,
because only the enclave holds the private key. Same exposure the sealed bids already have, and the
same hardening applies.
