# Can the confidential handler load an X25519 private key from secrets and decrypt a sealed box in-enclave?

Status: ready-for-human Type: research Blocked by: 01-cre-simulate-writes-to-arc.md

This is the load-bearing one. If the enclave cannot decrypt, the relay has to hold plaintext behind
a bearer token, the envelope stops hiding anything, and a relay leak during bidding lets a late
supplier undercut a rival. In that case, and only that case, a reveal deadline comes back after the
bid deadline, and `docs/adr/0001-no-reveal-phase.md` is reopened.

Confirm which crypto library the enclave runtime exposes beyond hashing.

## Acceptance criteria

- [ ] Row V3 is answered, naming the crypto the enclave runtime exposes beyond hashing.
- [ ] A sealed box decrypted inside the handler is in `docs/evidence/`, or the failure is.
- [ ] A no answer produces a written decision on the reveal deadline, not silence.

## Comments
