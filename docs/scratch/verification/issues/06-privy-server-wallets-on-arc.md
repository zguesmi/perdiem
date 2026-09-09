# Do Privy server wallets sign on chain id 5042002, do policy rules accept a custom chain id, and are key quorums available on the free tier?

Status: closed Type: research

The Privy prize needs one working business workflow with at least one control. The plan is a spend
policy plus a key quorum above the ceiling. If quorums are not on the free tier, the fallback is
policy-only, and the README has to say so rather than imply a quorum that does not exist.

## Acceptance criteria

- [x] Row V6 is answered on all three questions: signing on the Arc chain id, custom chain ids in
      policy rules, key quorums on the free tier.
- [x] A signed transaction from a server wallet on Arc testnet is in `docs/evidence/`.
- [x] If quorums are unavailable, the fallback is recorded and build ticket 11 is updated.

## Comments

Signing works, broadcasting does not. `eth_signTransaction` signs for chain id 5042002; the policy
pins the chain id and rejects any other. `eth_sendTransaction` returns
`App is not authorized to transact on chain eip155:5042002`, so the requisition service broadcasts
the signed RLP to `ARC_RPC_URL` itself.

A 2-of-2 key quorum was created and enforced on the app in use, so no policy-only fallback is needed
and build ticket 11 stands as written.

Evidence and the exact requests: `docs/evidence/06-privy-server-wallets-on-arc.md`.
