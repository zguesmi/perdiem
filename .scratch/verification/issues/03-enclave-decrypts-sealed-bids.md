# Can the confidential handler load an X25519 private key from secrets and decrypt a sealed box in-enclave?

Status: ready-for-human

This is the load-bearing one. If the enclave cannot decrypt, the relay has to hold plaintext
behind a bearer token, the envelope stops hiding anything, and a relay leak during bidding lets a
late supplier undercut a rival. In that case, and only that case, a reveal deadline comes back after
the bid deadline, and `docs/adr/0001-no-reveal-phase.md` is reopened.

Confirm which crypto library the enclave runtime exposes beyond hashing.

## Comments
