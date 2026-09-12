# Evidence: the enclave decrypts a sealed bid

Run date: 2026-09-09. Answers
`docs/scratch/verification/issues/03-enclave-decrypts-sealed-bids.md` and row V3 of
`docs/decisions.md`.

CRE CLI `v1.32.0`, template `hello-confidential-workflows-ts`, scaffolded in a scratch directory so
nothing in the repo depends on it. Both `@chainlink/cre-sdk` 1.18.0 and 1.20.0 were run, with
identical results. No chain and no HTTP: the ciphertexts were carried in the workflow config, and
the two private keys were Vault DON secrets.

## 1. What the runtime exposes

First line of the handler, before any library loads:

```
[USER LOG] runtime inventory: crypto=undefined crypto.subtle=undefined
           crypto.getRandomValues=undefined WebAssembly=undefined BigInt=function
           Buffer=function Date.now=function randomSeed=undefined
```

So the enclave exposes **no crypto at all** beyond what a pure-JavaScript library computes for
itself. No WebCrypto, no `crypto.getRandomValues`, no `WebAssembly` to load a wasm build of
libsodium into. `BigInt`, `Buffer`, `TextEncoder` and `Date.now` are there, which is everything
`@noble/*` needs.

`node:crypto` is refused at build, twice over. With type checks on:

```
workflow.ts:11:28 '"node:crypto"' has no exported member named 'diffieHellman'.
```

With `--skip-type-checks`:

```
❌ Unsupported API usage found in workflow source.
CRE workflows run on Javy (QuickJS), not full Node.js.
- workflow.ts:11:34 'node:crypto' is not available in CRE workflow runtime.
```

## 2. The answer: yes

Nine probes in one `handlerInTee`, each wrapped in `try`/`catch` so one failure hides none of the
others. Each one decrypts the same plaintext — a 548-byte Sealed Bid envelope, bid C from
`docs/spec.md` with its salt and a 65-byte signature — and asserts `keccak256(plaintext)` against
the value the sealing script computed. The plaintext is never logged, and neither is any field of
it.

```
[USER LOG] keygen in enclave: threw: crypto.getRandomValues must be defined
[USER LOG] secret lengths: x25519=32 secp256k1=32
[USER LOG] ok   A x25519+hkdf-sha256+xchacha20poly1305 ms=11 bytes=548 keccakMatch=true shaped=true
[USER LOG] ok   B nacl box (tweetnacl) ms=85 bytes=548 keccakMatch=true shaped=true
[USER LOG] ok   C libsodium sealed box ms=81 bytes=548 keccakMatch=true shaped=true
[USER LOG] ok   D secp256k1 ecies+hkdf-sha256+xchacha20poly1305 ms=28 bytes=548 keccakMatch=true shaped=true
[USER LOG] fail E x25519 with a wrong private key (must fail) ms=10 threw: invalid tag
[USER LOG] fail F x25519 with a tampered ciphertext (must fail) ms=9 threw: invalid tag
[USER LOG] ok   G nacl box opened with @noble only (no tweetnacl) ms=8 bytes=548 keccakMatch=true shaped=true
[USER LOG] ok   H x25519+hkdf-sha256+aes-256-gcm ms=13 bytes=548 keccakMatch=true shaped=true
[USER LOG] ok   I libsodium sealed box opened with @noble only ms=12 bytes=548 keccakMatch=true shaped=true
[USER LOG] three-bid batch, scheme A: ms=30

✓ Workflow Simulation Result:
"A=ok B=ok C=ok D=ok E=fail F=fail batch3Ms=30"
```

- `runtime.getSecret()` returned both 32-byte private keys inside the handler. A base64 string is
  the transport; the secret value is text.
- E and F are the fail-closed checks. A wrong private key and a single flipped ciphertext byte both
  produce `invalid tag` from the Poly1305 check, not a garbage plaintext.
- The demo is three bids. Three decryptions of scheme A cost 30 ms, against a 90-second bid window.
  Decryption is not a budget line.

## 3. The enclave cannot make its own keypair

```
[USER LOG] keygen in enclave: threw: crypto.getRandomValues must be defined
```

Every scheme above needs randomness to **seal** and none to **open**. Sealing happens in the agent,
on Node, so this costs the design nothing. It does close one door: the enclave cannot generate the
recipient keypair and publish the public half, because a Vault DON secret has to exist before the
run that reads it. `requisition/` generating the keypair is not laziness; it is the only place a
32-byte secret can come from. The buyer holding the private half stays a stated limitation of the
demo.

## 4. What each probe actually computed

Wire formats, all base64 in the config:

| Probe | Envelope                          | Key derivation                          |
| ----- | --------------------------------- | --------------------------------------- |
| A     | `epk(32) || nonce(24) || ct`        | `HKDF-SHA256(X25519(esk, pk), epk || pk, "perdiem/sealed-bid/v1", 32)` |
| B, G  | `epk(32) || nonce(24) || ct`        | `HSalsa20(X25519(esk, pk), 0^16)`, the `crypto_box` derivation |
| C, I  | `epk(32) || ct`                    | same as B, nonce `blake2b(epk || pk, 24)` |
| D     | `epk(33) || nonce(24) || ct`        | `HKDF-SHA256(secp256k1 ECDH, epk || pk, …, 32)` |
| H     | `epk(32) || nonce(12) || ct`        | same as A                               |

AEADs: XChaCha20-Poly1305 for A and D, XSalsa20-Poly1305 for B, C, G and I, AES-256-GCM for H. A
548-byte bid seals to 620 bytes under A, 596 under C, well inside the relay's 16 KiB cap.

Every envelope was sealed on Node and opened there first, so a probe failure could only be the
runtime:

```
$ node v3/tools/seal.mjs
plaintext bytes          548
plaintext keccak         0x22c2bd1d253a068eecff1f318c4388cc376c18899b4459c1644c8b6bef52cae2
A x25519+hkdf+xchacha    620 bytes, host decrypt true
B nacl box               620 bytes, host decrypt true
C sealed box             596 bytes, host decrypt true
D secp256k1 ecies        621 bytes, host decrypt true
H x25519+hkdf+aes-gcm    608 bytes, host decrypt true
```

## 5. The 80 ms is tweetnacl, not the scheme

B and C ran 7 to 8 times slower than the rest. The difference is one function: tweetnacl's X25519,
which avoids `BigInt` and pays for it. G and I open the exact same B and C envelopes with `@noble`
only — `x25519.getSharedSecret`, then `hsalsa` for the `crypto_box` key — and land at 8 and 12 ms.
So NaCl wire compatibility is free; the library that computes it is what costs. Nothing here needs
tweetnacl.

## 6. HPKE (RFC 9180) does not fit, for a second reason

`@hpke/core` 1.7.4 imports and constructs a suite inside the enclave:

```
[USER LOG] hpke: constructed suite kemId=32
[USER LOG] hpke: generateKeyPair returned a Promise
```

`generateKeyPair` neither resolved nor rejected before the handler returned. The HPKE API is `async`
and the TEE handler is synchronous, so there is nothing to await it with — and underneath, the
library reaches for `crypto.subtle`, which the inventory above says is `undefined`. Two independent
blockers. The RFC's construction is still worth copying by hand, which is what probe A is.

## What this does not prove

- The simulator is not a real TEE, per row V10. These probes show that the compiled QuickJS binary
  computes X25519 and an AEAD. They say nothing about attestation.
- The ciphertexts came from the workflow config, not from the relay over HTTP. Fetching them is rows
  V2 and V13.
- Nothing was deployed to a DON. The secrets came from `.env` through `secrets.yaml`, which is row
  V4.
- `@noble/hashes` was pinned to 1.8.0 to match `@noble/curves` 1.9.6. `viem` 2.34.0 pulls
  `@noble/hashes` 2.2.0, where `sha256` moved to `@noble/hashes/sha2`. The import paths in
  `workflow-cre/` need to match whichever pair the workspace resolves.
