# Carry the supplier's booking credentials in the sealed bid envelope

Status: resolved Type: task Blocked by: none (can start immediately)

The Enclave books the winner itself, so it needs the winner's own booking API and key. They travel
inside the Sealed Bid envelope, where nobody but the Enclave reads them. See
`docs/adr/0006-the-enclave-books-with-supplier-credentials.md`.

This ticket changes code that is already merged: the payload schema in `shared/sealed-bid.ts`, its
tests, and the agents that seal.

The plaintext becomes `{ bid, salt, signature, bookingUrl, bookingApiKey }`. The two credentials sit
flat beside the other members rather than under a `booking` object.

Neither is a field of the `Bid` type. They travel beside the Bid like the salt, for the same reason:
a field the EIP-712 type does not have cannot reach `hashStruct` by accident. No Bid hash, no
commitment and no signature changes.

Each agent reads its own `bookingUrl` and `bookingApiKey` from its environment. All three hold the
same LiteAPI sandbox account in this deployment, and the schema does not know that.

A credential in a log is the whole failure mode here. They must never be logged, must never be
serialised into an error message, and must never reach the relay in the clear.

## Acceptance criteria

- [x] The sealed bid payload schema carries `bookingUrl` and `bookingApiKey`, and a payload without
      them fails to parse.
- [x] The `Bid` type, `bidHash`, the commitment and the EIP-712 signature are byte-identical to
      before. One test states it.
- [x] A sealed envelope round-trips the credentials, and the ciphertext is unreadable without the
      enclave private key.
- [ ] Each agent seals its own credentials, read from its own environment. Deferred: no agent seals
      yet, so this lands with ticket 09.
- [ ] No log line, no error message and no relay payload carries `bookingApiKey`. One test greps the
      agent output. Deferred with the line above; the envelope-level check is in
      `shared/sealed-bid.test.ts`.

## Comments

Implemented in `shared/sealed-bid.ts` and `shared/sealed-bid.test.ts`. The two agent criteria are
deferred to ticket 09, which is where an agent first seals anything.

## Dev review

Not reviewed yet.
