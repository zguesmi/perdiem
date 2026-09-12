# Can the confidential handler read the chain and call confidential HTTP in simulation?

Status: resolved Type: research Blocked by: 01-cre-simulate-writes-to-arc.md

Two answers, one ticket, because both are properties of the same handler.

The chain read decides how the Bids Root is built. Preferred: the enclave reads the commitments
itself and hashes the sorted set. Fallback: the workflow passes them in, the enclave checks every
sealed bid against that set, and the guarantee degrades to "the same lie was not fed to both the
enclave and the contract".

Confidential HTTP decides how the sealed bids are fetched from the relay. Fallback is plain HTTP
inside the handler, which is weaker and must be recorded as such.

Record which path was taken and why.

## Acceptance criteria

- [x] Row V2 is answered for both halves: the chain read and confidential HTTP.
- [x] The chosen Bids Root path is recorded, preferred or fallback, with the reason.
- [x] If the fallback is taken, the weaker guarantee is written into `docs/spec.md` rather than left
      in this ticket. The preferred path holds, so there is no weaker guarantee to write.

## Answer

Both halves work in simulation. The preferred Bids Root path holds: the enclave reads
`commitmentsOf` itself and hashes the sorted set. The fallback is dropped from `docs/spec.md`.

The chain read needs a cast. `EVMClient.callContract` is typed for `Runtime`, and `TeeRuntime` is
not assignable to it, in `@chainlink/cre-sdk` 1.18.0 and 1.20.0 alike. `HTTPClient.sendRequest` is
the only capability with a `TeeRuntime` overload. The cast costs nothing at runtime:
`TeeRuntimeImpl.callCapability` delegates to the same `RuntimeImpl` that `usingTheDons()` returns,
and the request it builds carries no TEE flag. Where a capability call executes is decided by where
the binary runs, not by which runtime object it goes through.

Confidential HTTP is `cre.capabilities.HTTPClient` with the TEE runtime, capability id
`http-actions@1.0.0-alpha`. `cre.capabilities.ConfidentialHTTPClient` is a separate capability,
`confidential-http@1.0.0-alpha`, typed for `Runtime` only. It also returned `200` from inside the
handler, but the template says not to use it there, so the workflow uses `HTTPClient`.

A `bytes32[]` return decoded correctly inside the handler, and the root it built matched the one
Hardhat computed off chain over the same three commitments.

The simulator is not a real TEE, per row V10, so none of this proves an AWS Nitro enclave exposes
the `evm` capability. That is the standing risk on the preferred path. The fallback stays available
as code, not as spec: if a deployed enclave rejects the read, the workflow passes the commitments in
and the guarantee degrades as the ticket described.

Evidence:
[02 — The chain read and confidential HTTP inside `handlerInTee`](../evidence/02-enclave-chain-read-and-confidential-http.md).

## Comments
