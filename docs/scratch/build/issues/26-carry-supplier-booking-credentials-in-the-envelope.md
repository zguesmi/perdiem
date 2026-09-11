# Carry the supplier's booking credentials in the sealed bid envelope

Status: ready-for-agent Type: task Blocked by: none (can start immediately)

The Enclave books the winner itself, so it needs the winner's own booking API and key. They travel
inside the Sealed Bid envelope, where nobody but the Enclave reads them. See
`docs/adr/0006-the-enclave-books-with-supplier-credentials.md`.

This ticket changes code that is already merged: the payload schema in `shared/sealed-bid.ts`, its
tests, and the agents that seal.

The plaintext becomes `{ bid, salt, signature, booking }`, with `booking` as `{ baseUrl, apiKey }`.

`booking` is not a field of the `Bid` type. It travels beside the Bid like the salt, for the same
reason: a field the EIP-712 type does not have cannot reach `hashStruct` by accident. No Bid hash,
no commitment and no signature changes.

Each agent reads its own `baseUrl` and `apiKey` from its environment. All three hold the same
LiteAPI sandbox account in this deployment, and the schema does not know that.

A credential in a log is the whole failure mode here. `booking` must never be logged, must never be
serialised into an error message, and must never reach the relay in the clear.

## Acceptance criteria

- [ ] The sealed bid payload schema carries `booking: { baseUrl, apiKey }`, and a payload without it
      fails to parse.
- [ ] The `Bid` type, `bidHash`, the commitment and the EIP-712 signature are byte-identical to
      before. One test states it.
- [ ] A sealed envelope round-trips the credentials, and the ciphertext is unreadable without the
      enclave private key.
- [ ] Each agent seals its own credentials, read from its own environment.
- [ ] No log line, no error message and no relay payload carries `apiKey`. One test greps the agent
      output.

## Comments

## Dev review

Not reviewed yet.
