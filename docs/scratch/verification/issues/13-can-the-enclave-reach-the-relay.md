# Can the confidential handler reach a relay running on the developer's machine?

Status: ready-for-human Type: research Blocked by: 01-cre-simulate-writes-to-arc.md,
02-enclave-chain-read-and-confidential-http.md

`docs/scratch/verification/issues/02` asks whether the handler can make a confidential HTTP call at
all. This asks the narrower question the demo actually depends on: whether that call can reach
`relay/`, which in the demo runs on localhost.

If the simulation executes the handler in a container or a sandbox with its own network namespace,
`http://localhost:8787` resolves inside that namespace and the relay is unreachable. The failure
looks like every sealed bid being missing, which ends in a refund with no winner — the one outcome
the demo cannot survive.

What to establish, in this order:

- Which host name the handler must use to reach a service on the developer's machine.
- Whether the runtime restricts outbound hosts to an allow list, and where that list is configured.
- Whether plain `http` is permitted or the call must be `https`, which would mean a certificate for
  a local service.

Fallbacks, in preference order: a host name the runtime provides for the developer's machine; a
tunnel to a public URL; the relay deployed to a small public host for the demo; the sealed bids
passed into the handler as an argument by the workflow, which weakens nothing about secrecy but
makes the workflow nodes hold ciphertext they currently never see.

Record the answer and the chosen path in `docs/decisions.md`.

## Acceptance criteria

- [ ] Row V13 records the host name the handler must use, whether outbound hosts are restricted, and
      whether plain HTTP is permitted.
- [ ] The chosen path is recorded, with the fallbacks that were rejected and why.
- [ ] A handler fetching from the relay is in `docs/evidence/`, or the failure is.

## Comments
