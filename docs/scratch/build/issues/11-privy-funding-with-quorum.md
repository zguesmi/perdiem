# Fund the auction from a Privy organization wallet

Status: ready-for-human Type: task Blocked by: 04, 10

The organization wallet signs `createAuction`. Its spend policy allows USDC transfers to the
`SealedAuction` contract and nothing else. Above the ceiling, a key quorum signs: travel manager and
finance. Both approvals show in the UI.

This is the B2B workflow the Privy prize asks for, so it has to actually work, not be described.

## Acceptance criteria

- [ ] The organization wallet signs `createAuction` on Arc testnet, and the transaction hash appears
      on the page.
- [ ] The spend policy allows USDC transfers to `SealedAuction` and nothing else, and a refused
      transfer to another address is captured as evidence.
- [ ] A Budget under the 500 ceiling passes on the policy alone. That is the path the tests use.
- [ ] The 750 Budget fires the two-signer key quorum, and both approvals show in the UI.
- [ ] The requisition service broadcasts the signed transaction to `ARC_RPC_URL`. Privy will not
      broadcast on Arc.

## Comments

Verification 06 is closed. Key quorums work on the app in use, so the policy-only fallback is
dropped. Privy signs but does not broadcast on Arc: `eth_sendTransaction` returns
`App is not authorized to transact on chain eip155:5042002`. Use `eth_signTransaction` and send the
RLP to `ARC_RPC_URL`. See `docs/evidence/06-privy-server-wallets-on-arc.md`.
