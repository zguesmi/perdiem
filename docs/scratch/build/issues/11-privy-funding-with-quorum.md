# Fund the auction from a Privy organization wallet

Status: ready-for-human
Blocked by: 04, ../verification/issues/06-privy-server-wallets-on-arc.md

The organization wallet signs `createAuction`. Its spend policy allows USDC transfers to the
`SealedAuction` contract and nothing else. Above the ceiling, a key quorum signs: travel manager and
finance. Both approvals show in the UI.

This is the B2B workflow the Privy prize asks for, so it has to actually work, not be described.

## Comments
