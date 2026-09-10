# Fund the auction from a Privy organization wallet

Status: ready-for-human Type: task Blocked by: 04, 10

The organization wallet signs `createAuction`. Its spend policy allows USDC transfers to the
`SealedAuction` contract and nothing else. Above the ceiling, a key quorum signs: travel manager and
finance. Both approvals show in the UI.

This is the B2B workflow the Privy prize asks for, so it has to actually work, not be described.

## Acceptance criteria

- [ ] The organization wallet signs `createAuction` on Arc testnet, and the transaction hash appears
      on the page.
- [ ] The spend policy has two `ALLOW` rules, both reading the calldata with
      `field_source: ethereum_calldata` and the contract ABI: `approve(spender, value)` on the USDC
      ERC-20 with `spender` equal to `SealedAuction`, and `createAuction(...)` on `SealedAuction`
      with the Payout Cap within the ceiling. Every rule pins `chain_id` to 5042002 and uses
      `method: eth_signTransaction`.
- [ ] A refused `approve` to another spender is captured as evidence.
- [ ] A Payout Cap under the 500 ceiling passes on the policy alone. That is the path the tests use.
- [ ] The 750 Payout Cap fires the two-signer key quorum, and both approvals show in the UI. The
      ceiling is a per-signer override policy, not a quorum threshold: the wallet carries a server
      authorization key capped at 500 and a key quorum of two with no cap, and the service picks the
      signer from the Payout Cap. The override-policy path is unverified.
- [ ] The requisition service broadcasts the signed transaction to `ARC_RPC_URL`. Privy will not
      broadcast on Arc.

## Comments

Verification 06 is closed. Key quorums work on the app in use, so the policy-only fallback is
dropped. Privy signs but does not broadcast on Arc: `eth_sendTransaction` returns
`App is not authorized to transact on chain eip155:5042002`. Use `eth_signTransaction` and send the
RLP to `ARC_RPC_URL`. See `docs/evidence/06-privy-server-wallets-on-arc.md`.

Funding is two signed transactions, not one. `createAuction` pulls the Payout Cap with
`transferFrom`, so an `approve` on the USDC ERC-20 has to be signed first. A policy that allows only
transfers to `SealedAuction` blocks that `approve` and the funding flow fails.
