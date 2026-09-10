# Seal the bid to the enclave public key

Status: done Type: task Blocked by: 03, ../verification/issues/03-enclave-decrypts-sealed-bids.md

The supplier seals the bid, its salt and its signature to the enclave's X25519 public key. The salt
goes inside the ciphertext: a leaked salt unseals the commitment, because the bid space is small
enough to brute-force in seconds.

Blocked on the enclave being able to decrypt. If it cannot, this ticket changes shape entirely and
`docs/adr/0001-no-reveal-phase.md` is reopened.

## Acceptance criteria

- [x] The envelope seals `{bid, salt, signature}` to the auction's enclave public key, and the salt
      exists nowhere outside the ciphertext.
- [x] The scheme and the library match what verification 03 found in the enclave runtime, and the
      choice is recorded.
- [x] A round trip test seals, decrypts with the private half, checks the signature, then checks the
      commitment.
- [x] A tampered ciphertext fails to open, and only a count is logged.
- [x] The demo bid's ciphertext is under the relay's 16 KiB cap.

## Comments

## Dev review

Implemented in `shared/sealed-bid.ts`, exactly the scheme in
`docs/adr/0005-sealed-bid-envelope-scheme.md`. `@noble/*` is at version 2.4.0, where the sealing
side calls `x25519.utils.randomSecretKey()`; version 1 called it `randomPrivateKey`.

The demo envelope is 620 bytes against the relay's 16,384-byte cap, which matches the figure in the
ADR.

Opening needs no randomness, which is what lets it run in the enclave. Sealing needs
`crypto.getRandomValues`, so it runs on Node in the supplier agent.

The plaintext is decoded with `Buffer`, not `TextDecoder`, and the HKDF info prefix is bytes rather
than a `TextEncoder` call. Verification 03 confirmed `Buffer` in the enclave runtime and probed
neither of the other two.

`openSealedBid` also checks that the bid names the auction the envelope was sealed for. The HKDF
binds the envelope to the auction and says nothing about the bid inside it, so without the check a
supplier can re-seal a bid signed for one auction under another and pass both the signature and the
commitment.
