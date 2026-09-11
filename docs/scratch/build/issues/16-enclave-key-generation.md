# Generate the enclave key away from the buyer and every supplier

Status: ready-for-human Type: task Blocked by:
../verification/issues/03-enclave-decrypts-sealed-bids.md

The enclave private key opens every Sealed Bid and, since
`docs/adr/0006-the-enclave-books-with-supplier-credentials.md`, every supplier's booking
credentials. Its holder can read every price and spend on three supplier accounts.

So an independent party generates the X25519 keypair, neither the buyer nor any supplier, and
uploads the private half as a workflow secret. Only the public half reaches the deployment, as the
`SealedAuction` constructor argument. The requisition service must not generate it.

The enclave cannot generate the pair itself. It has no randomness, and
`x25519.utils.randomPrivateKey()` throws `crypto.getRandomValues must be defined` there. Row V3.

That leaves a trusted party rather than no trusted party. A scheme where the private half only ever
exists inside an attested enclave is what would fix it, and it is out of scope here. Say so in the
README rather than claiming a property the code does not have.

## Acceptance criteria

- [ ] A documented key-generation step runs outside `requisition/`, and `requisition/` no longer
      generates the keypair.
- [ ] The private half is uploaded as a workflow secret by that party. The buyer never holds it.
- [ ] The README names who holds the private half and what its holder can read: every Sealed Bid and
      every supplier's booking credentials.
- [ ] The README names what would remove the trusted party and why that is out of scope here.
- [ ] No sentence in the README or on the page claims a secrecy the code does not have.

## Comments

## Dev review

Not reviewed yet.
