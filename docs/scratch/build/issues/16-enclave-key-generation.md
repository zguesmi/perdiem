# Generate the enclave key so that only the enclave can decrypt a bid

Status: ready-for-human
Blocked by: ../verification/issues/03-enclave-decrypts-sealed-bids.md

Known limitation, recorded rather than hidden. Today the requisition service generates the
X25519 keypair and uploads the private half as a workflow secret, which means the buyer holds it and
can decrypt every sealed bid. Suppliers are protected from each other, not from the buyer.

What is needed is a scheme where the private half only ever exists inside the enclave. Until that
exists, say so plainly in the README rather than claiming a property the code does not have.

## Comments
