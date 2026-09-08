# Fund the auction from a Privy organization wallet

Status: ready-for-human
Type: task
Blocked by: 04, 10, ../verification/issues/06-privy-server-wallets-on-arc.md

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
- [ ] If quorums are not on the free tier, the README says policy-only rather than implying a quorum
      that does not exist.

## Comments
