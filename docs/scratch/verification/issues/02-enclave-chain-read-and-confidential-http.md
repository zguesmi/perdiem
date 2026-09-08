# Can the confidential handler read the chain and call confidential HTTP in simulation?

Status: ready-for-human
Type: research
Blocked by: 01-cre-simulate-writes-to-arc.md

Two answers, one ticket, because both are properties of the same handler.

The chain read decides how the Bids Root is built. Preferred: the enclave reads the commitments
itself and hashes the sorted set. Fallback: the workflow passes them in, the enclave checks every
sealed bid against that set, and the guarantee degrades to "the same lie was not fed to both the
enclave and the contract".

Confidential HTTP decides how the sealed bids are fetched from the relay. Fallback is plain HTTP
inside the handler, which is weaker and must be recorded as such.

Record which path was taken and why.

## Acceptance criteria

- [ ] Row V2 is answered for both halves: the chain read and confidential HTTP.
- [ ] The chosen Bids Root path is recorded, preferred or fallback, with the reason.
- [ ] If the fallback is taken, the weaker guarantee is written into `docs/spec.md` rather than left
      in this ticket.

## Comments
