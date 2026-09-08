# Does `cre workflow simulate` broadcast a real write to Arc testnet, and which forwarder address does it use?

Status: ready-for-human
Type: research
Blocked by: 10-confidential-workflows-beta-access.md, 12-arc-chain-id-and-rpc-endpoint.md

The contract accepts settlements only from the CRE forwarder, so the forwarder address is a
constructor argument. If simulation does not broadcast, the demo needs a different story for the
settlement transaction.

Record the forwarder address in `docs/decisions.md` and save the simulation output to
`docs/evidence/`.

## Acceptance criteria

- [ ] Row V1 in `docs/decisions.md` is answered, with the forwarder address written out.
- [ ] The simulation output is saved in `docs/evidence/`.
- [ ] If simulation does not broadcast, the ticket records what the demo's settlement transaction is
      instead.

## Comments
