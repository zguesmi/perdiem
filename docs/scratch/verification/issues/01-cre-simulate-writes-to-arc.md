# Does `cre workflow simulate` broadcast a real write to Arc testnet, and which forwarder address does it use?

Status: ready-for-human

The contract accepts settlements only from the CRE forwarder, so the forwarder address is a
constructor argument. If simulation does not broadcast, the demo needs a different story for the
settlement transaction.

Record the forwarder address in `docs/decisions.md` and save the simulation output to
`docs/evidence/`.

## Comments
