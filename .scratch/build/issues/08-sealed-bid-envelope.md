# Seal the bid to the enclave public key

Status: ready-for-agent
Blocked by: 03, ../verification/issues/03-enclave-decrypts-sealed-bids.md

The supplier seals the bid, its salt and its signature to the enclave's X25519 public key. The
salt goes inside the ciphertext: a leaked salt unseals the commitment, because the bid space is small
enough to brute-force in seconds.

Blocked on the enclave being able to decrypt. If it cannot, this ticket changes shape entirely and
`docs/adr/0001-no-reveal-phase.md` is reopened.

## Comments
