# Can the confidential handler reach a relay running on the developer's machine?

Status: resolved Type: research Blocked by: 01-cre-simulate-writes-to-arc.md,
02-enclave-chain-read-and-confidential-http.md

`docs/scratch/verification/issues/02` asks whether the handler can make a confidential HTTP call at
all. This asks the narrower question the demo actually depends on: whether that call can reach
`relay/`, which in the demo runs on localhost.

If the simulation executes the handler in a container or a sandbox with its own network namespace,
`http://localhost:8787` resolves inside that namespace and the relay is unreachable. The failure
looks like every sealed bid being missing, which ends in a refund with no winner. That is the one
outcome the demo cannot survive.

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

- [x] Row V13 records the host name the handler must use, whether outbound hosts are restricted, and
      whether plain HTTP is permitted.
- [x] The chosen path is recorded, with the fallbacks that were rejected and why.
- [x] A handler fetching from the relay is in `docs/scratch/verification/evidence/`, or the failure is.

## Comments

## Answer

Yes, in simulation. `http://localhost:8787` and `http://127.0.0.1:8787` both return `200` in 5 to 7
ms from inside `handlerInTee`. There is no allow list and nothing to configure. Plain `http` is
permitted, and the scheme is honoured rather than rewritten: `https` against the same HTTP server
fails with `http: server gave HTTP response to HTTPS client`.

The reason localhost resolves is that the HTTP capability runs in the CLI's own process. The relay
stub logged both requests as coming from `127.0.0.1`. Simulation gives the handler no separate
network namespace, which is what the ticket feared.

Chosen path: run the relay on `http://localhost:8787` and point the workflow config at it. The demo
runs through `cre workflow simulate`, per row V1, so the handler and the relay share a host. The
tunnel, the public relay host and passing sealed bids in as a workflow argument were all rejected;
the reasons are in the evidence file.

A relay that is down throws `connection refused`. An unknown auction returns `200` with `[]`. The
two cases stay distinguishable, so only a genuinely empty relay ends in a no-winner settlement.

Deployment is a different question. No DON can reach a developer's localhost, so a deployed demo
needs the relay on a public host. That is one config value.

Evidence: `docs/scratch/verification/evidence/13-can-the-enclave-reach-the-relay.md`.
