# Generate the enclave key so that only the enclave can decrypt a bid

Status: ready-for-human Type: task Blocked by:
../verification/issues/03-enclave-decrypts-sealed-bids.md

What this ticket delivers today is documentation, not code: the scheme where the private half never
leaves the enclave is out of scope for the demo, so what ships is the honest statement of the
limitation. It overlaps ticket 18, which owns the README. Whether it stays a ticket or folds into 18
is a question for the review.

Known limitation, recorded rather than hidden. Today the requisition service generates the X25519
keypair and uploads the private half as a workflow secret, which means the buyer holds it and can
decrypt every sealed bid. Suppliers are protected from each other, not from the buyer.

What is needed is a scheme where the private half only ever exists inside the enclave. Until that
exists, say so plainly in the README rather than claiming a property the code does not have.

## Acceptance criteria

- [ ] The README states plainly that the requisition service generates the X25519 keypair, so the
      buyer can decrypt every Sealed Bid.
- [ ] The limitation names what would fix it and why that is out of scope here.
- [ ] No sentence in the README or on the page claims secrecy from the buyer.

## Comments

## Dev review

Not reviewed yet.
