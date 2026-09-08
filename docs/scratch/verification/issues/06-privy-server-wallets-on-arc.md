# Do Privy server wallets sign on chain id 5042002, do policy rules accept a custom chain id, and are key quorums available on the free tier?

Status: ready-for-human
Type: research
Blocked by: 12-arc-chain-id-and-rpc-endpoint.md

The Privy prize needs one working business workflow with at least one control. The plan is a
spend policy plus a key quorum above the ceiling. If quorums are not on the free tier, the fallback
is policy-only, and the README has to say so rather than imply a quorum that does not exist.

## Acceptance criteria

- [ ] Row V6 is answered on all three questions: signing on the Arc chain id, custom chain ids in
      policy rules, key quorums on the free tier.
- [ ] A signed transaction from a server wallet on Arc testnet is in `docs/evidence/`.
- [ ] If quorums are unavailable, the fallback is recorded and build ticket 11 is updated.

## Comments
