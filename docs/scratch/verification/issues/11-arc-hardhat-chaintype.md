# Which Hardhat 3 `chainType` does Arc testnet need: `l1` or `generic`?

Status: ready-for-agent
Type: research

Hardhat 3 declares each network with a `type` and a `chainType`. The generated config ships
`l1` and `op` examples. Arc's correct value decides whether the network entry works at all.

This one is answerable from the Hardhat and Arc documentation without an account, so an agent can
close it.

## Acceptance criteria

- [ ] Row V11 is answered with the value and the documentation it came from.
- [ ] `onchain/hardhat.config.ts` carries an Arc network entry with that value, and one command
      against it succeeds.

## Comments
