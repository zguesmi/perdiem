# Seal the bid to the enclave public key

Status: ready-for-agent Type: task Blocked by: 03,
../verification/issues/03-enclave-decrypts-sealed-bids.md

The supplier seals the bid, its salt and its signature to the enclave's X25519 public key. The salt
goes inside the ciphertext: a leaked salt unseals the commitment, because the bid space is small
enough to brute-force in seconds.

Blocked on the enclave being able to decrypt. If it cannot, this ticket changes shape entirely and
`docs/adr/0001-no-reveal-phase.md` is reopened.

## Acceptance criteria

- [ ] The envelope seals `{bid, salt, signature}` to the auction's enclave public key, and the salt
      exists nowhere outside the ciphertext.
- [ ] The scheme and the library match what verification 03 found in the enclave runtime, and the
      choice is recorded.
- [ ] A round trip test seals, decrypts with the private half, checks the signature, then checks the
      commitment.
- [ ] A tampered ciphertext fails to open, and only a count is logged.
- [ ] The demo bid's ciphertext is under the relay's 16 KiB cap.

## Comments
