# Evidence: the confidential handler reaches a relay on localhost

Run date: 2026-09-09. Answers `docs/scratch/verification/issues/13-can-the-enclave-reach-the-relay.md`
and row V13 of `docs/decisions.md`.

CRE CLI `v1.32.0`, `@chainlink/cre-sdk` 1.20.0. A stub of `relay/` served
`GET /auctions/{auctionId}/bids` on `0.0.0.0:8787` from Node, returning the shape `docs/spec.md`
specifies. The handler called it with `cre.capabilities.HTTPClient` and the `TeeRuntime`.

## `http://localhost` works, and so does plain HTTP

```
[USER LOG] http://localhost:8787/auctions/0x01/bids status=200 ms=7 bodyChars=66 body=[{"supplier":"0xaaa","ciphertext":"c2VhbGVkLWJpZC1jaXBoZXJ0Z
[USER LOG] http://127.0.0.1:8787/auctions/0x01/bids status=200 ms=5 bodyChars=66 body=[{"supplier":"0xaaa","ciphertext":"c2VhbGVkLWJpZC1jaXBoZXJ0Z
[USER LOG] http://host.docker.internal:8787/auctions/0x01/bids status=500 ms=8 bodyChars=0 body=
[USER LOG] https://localhost:8787/auctions/0x01/bids threw after 4ms: [2]Unknown: Get "https://localhost:8787/auctions/0x01/bids": http: server gave HTTP response to HTTPS client
```

- `localhost` and `127.0.0.1` both return `200` in 5 to 7 ms. No host name is special and nothing
  needs configuring: there is no allow list to add the relay to.
- Plain `http` is permitted. The `https` attempt fails because the stub speaks HTTP, which is the
  proof that the scheme is honoured rather than rewritten. No certificate for a local service.
- The stub logged both requests as coming from `127.0.0.1`, so the HTTP capability executes in the
  CLI's own process on the developer's machine. That is why localhost resolves: in simulation there
  is no separate network namespace.

## The failure is loud, not silent

```
[USER LOG] http://localhost:8788/auctions/0x01/bids threw after 3ms: [2]Unknown: Get "http://localhost:8788/auctions/0x01/bids": dial tcp [::1]:8788: connect: connection refused
[USER LOG] http://localhost:8787/auctions/0x99/bids status=200 ms=4 bodyChars=2 body=[]
```

A relay that is not running throws. An unknown auction returns `200` with `[]`, per the relay
interface. The two cases the ticket worried about are distinguishable: "the relay is down" throws,
"no sealed bids arrived" returns an empty array. Only the second should end in a no-winner
settlement.

## The chosen path

Run the relay on `http://localhost:8787` on the developer's machine and point the workflow config at
it. The demo runs through `cre workflow simulate`, per row V1, so the handler and the relay share a
host.

Rejected, and why:

- **A tunnel to a public URL** — unnecessary. It adds a dependency that can fail on stage for no
  gain.
- **The relay on a public host** — same, plus it puts every sealed bid on someone else's machine.
- **Sealed bids passed in as a workflow argument** — would make the Workflow DON nodes hold
  ciphertext they currently never touch. It leaks nothing, because only the enclave holds the
  private key, but it widens the blast radius of a bug for no benefit.

## What this does not prove

- Simulation only. A deployed workflow runs on a DON, and no DON can reach a developer's localhost.
  A deployed demo needs the relay on a public host, and that is a change of one config value.
- The simulator is not a real TEE, per row V10. This says the call leaves the CLI process. It does
  not say the call left an enclave.
- `host.docker.internal` returned `500` in this sandbox. That is the sandbox's name resolution, not
  a CRE limit, and the demo does not need it.
