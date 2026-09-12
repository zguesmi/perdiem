# Can the confidential handler load an X25519 private key from secrets and decrypt a sealed box in-enclave?

Status: resolved Type: research Blocked by: 01-cre-simulate-writes-to-arc.md

This is the load-bearing one. If the enclave cannot decrypt, the relay has to hold plaintext behind
a bearer token, the envelope stops hiding anything, and a relay leak during bidding lets a late
supplier undercut a rival. In that case, and only that case, a reveal deadline comes back after the
bid deadline, and `docs/adr/0001-no-reveal-phase.md` is reopened.

Confirm which crypto library the enclave runtime exposes beyond hashing.

## Acceptance criteria

- [x] Row V3 is answered, naming the crypto the enclave runtime exposes beyond hashing.
- [x] A sealed box decrypted inside the handler is in `docs/scratch/verification/evidence/`, or the
      failure is.
- [x] A no answer produces a written decision on the reveal deadline, not silence. The answer is
      yes, so `docs/adr/0001-no-reveal-phase.md` stands unchanged.

## Comments

## Answer

Yes. `runtime.getSecret()` returns a 32-byte X25519 private key inside `handlerInTee`, and the
handler decrypts a sealed bid in 11 ms. Three bids cost 30 ms against a 90-second bid window.

The runtime exposes no crypto of its own: `crypto`, `crypto.subtle`, `crypto.getRandomValues` and
`WebAssembly` are all `undefined`, and `node:crypto` is refused at build. It is Javy (QuickJS), so
every primitive comes from a pure-JavaScript library. `BigInt` and `Buffer` are present, which is
all `@noble/*` needs.

Nine schemes were probed in one handler. All five real candidates decrypt: X25519 with HKDF-SHA256
and XChaCha20-Poly1305 (11 ms), NaCl `crypto_box` (8 ms with `@noble`, 85 ms with tweetnacl),
libsodium sealed box (12 ms), secp256k1 ECIES (28 ms), and AES-256-GCM in place of XChaCha20 (13
ms). A wrong key and a flipped ciphertext byte both fail with `invalid tag`. HPKE through
`@hpke/core` cannot work: its API is async while the handler is synchronous, and it calls
`crypto.subtle`.

The enclave cannot generate a keypair — `crypto.getRandomValues must be defined`. Sealing needs
randomness and opening does not, so the agents seal on Node and nothing in the design breaks. It
does confirm that `requisition/` has to generate the keypair, so the buyer holding the private half
stays a stated limitation.

The chosen scheme and the rejected ones are in `docs/adr/0005-sealed-bid-envelope-scheme.md`.
Evidence: `docs/scratch/verification/evidence/03-enclave-decrypts-sealed-bids.md`.
