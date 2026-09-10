# The sealed bid envelope is X25519, HKDF-SHA256 and XChaCha20-Poly1305

The envelope is:

```
epk(32) ‖ nonce(24) ‖ ciphertext
key = HKDF-SHA256(ikm: X25519(esk, enclavePublicKey),
                  salt: epk ‖ enclavePublicKey,
                  info: "perdiem/sealed-bid/v1" ‖ auctionId,
                  32)
plaintext = JSON of { bid, salt, signature }
```

One ephemeral X25519 keypair per bid, thrown away after sealing. `@noble/curves`, `@noble/ciphers`
and `@noble/hashes` on both sides, and no other crypto dependency: `viem` already puts all three in
the tree.

Row V3 measured `info` as the version string alone. Adding `auctionId` to it costs nothing: HKDF
hashes it either way.

Measured in a confidential handler, row V3: 11 ms per bid, 30 ms for the demo's three, against a
90-second bid window. A wrong key and a flipped ciphertext byte both fail with `invalid tag`.

## Why X25519 rather than the curve everything else here uses

- Every 32-byte string is a valid X25519 public key, so there is no point validation to get wrong.
  secp256k1 ECDH has an invalid-curve attack surface that only careful code closes.
- It is a different key from any key that signs. A supplier's Circle wallet key and the buyer's
  Privy key sign; the enclave key only decrypts. One leaked key must not both forge a bid and open
  every rival's.
- 32-byte keys, one encoding. secp256k1 public keys come compressed or uncompressed, and a mismatch
  between two encoders is a silent hash difference — the same failure
  `docs/adr/0003-canonical-encoding.md` is about.
- It is 2.5 times faster in this runtime: 11 ms against 28 ms for secp256k1 ECDH with the same KDF
  and AEAD.

The cost: one more key type in the demo, and a public key that has to travel in `createAuction` and
`AuctionCreated` because it cannot be recovered from a signature the way an Ethereum address can.

## Alternatives, all of them measured in the enclave

- **NaCl `crypto_box`** — X25519 with `HSalsa20` key derivation and XSalsa20-Poly1305. Works, 8 ms
  with `@noble`, and any language with libsodium can seal it. Not chosen because the key comes from
  the shared secret alone: nothing binds the ciphertext to this auction or this deployment. HKDF
  binds `auctionId` and both public keys in, so a Sealed Bid cannot be replayed into another
  auction. With multi-language agents, this becomes the better trade.
- **libsodium sealed box** — `crypto_box` with the nonce derived as `blake2b(epk ‖ pk, 24)`, so no
  nonce on the wire: 596 bytes against 620. 12 ms. Same missing binding, plus a hash function used
  nowhere else in the project.
- **secp256k1 ECIES** — works, 28 ms. Rejected for the reasons above, not for speed.
- **HPKE, RFC 9180 (`@hpke/core`)** — the standard for exactly this. Dead here twice: its API is
  `async` and a TEE handler is synchronous, and it calls `crypto.subtle`, which the runtime does not
  have. Probe A is RFC 9180's construction written out by hand, which is the closest thing
  available.
- **WebCrypto X25519, `node:crypto`, libsodium-wasm** — all impossible. The runtime is Javy
  (QuickJS): no `crypto` global, no `WebAssembly`, and `node:crypto` is refused at build.
- **AES-256-GCM instead of XChaCha20-Poly1305** — works, 13 ms. XChaCha20's 24-byte nonce is safe to
  choose at random, where GCM's 12-byte nonce is not at scale, and software AES without AES-NI leaks
  through cache timing where ChaCha20 does not. Neither matters at three bids; XChaCha20 is the
  cheaper default.
- **tweetnacl** — the same NaCl schemes at 80 ms, seven times slower, because it avoids `BigInt`.
  Nothing here needs it.

## Consequences

- Sealing and opening are one function each in `shared/`, with a reference fixture both sides assert
  against, like the canonical encoder.
- `auctionId` inside `info` means an agent cannot seal one bid and post it to two auctions.
- The enclave cannot generate its own keypair: it has no randomness, and a Vault DON secret must
  exist before the run that reads it. `requisition/` generates the pair, so the buyer can decrypt
  every Sealed Bid. Stated in `docs/spec.md`, not fixed.
