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
- [ ] The purchaser service broadcasts the signed transaction to `ARC_RPC_URL`. Privy will not
      broadcast on Arc.

## Comments

Verification 06 is closed. Key quorums work on the app in use, so the policy-only fallback is
dropped. Privy signs but does not broadcast on Arc: `eth_sendTransaction` returns
`App is not authorized to transact on chain eip155:5042002`. Use `eth_signTransaction` and send the
RLP to `ARC_RPC_URL`. See `docs/scratch/verification/evidence/06-privy-server-wallets-on-arc.md`.

Funding is two signed transactions, not one. `createAuction` pulls the Payout Cap with
`transferFrom`, so an `approve` on the USDC ERC-20 has to be signed first. A policy that allows only
transfers to `SealedAuction` blocks that `approve` and the funding flow fails.

### 2026-09-12 — the code landed, nothing ran against Privy

Merged: #43 shares the contract ABI, #44 funds from the Privy wallet, #45 writes the spend policy,
#47 derives the payout cap.

No criterion is verified. Zero requests reached `api.privy.io`. The 97 tests use an injected funder
and a stubbed `fetch`, so they exercise no Privy path.

Three things remain:

- A live run with real credentials. It settles the snake_case transaction fields, the `chain_id`
  string in the policy condition, and whether Privy evaluates the policy for quorum-signed requests.
  An owner signature that overrides the policy stops the refusal demo firing.
- The probe evidence file. `pnpm --filter @perdiem/purchaser privy:policy probe` prints a refused
  `approve` to a spender the policy never names. Nothing sits in
  `docs/scratch/verification/evidence/` yet.
- The page has to call `POST /confirm`. `grep -rn "/confirm" ui/src` returns nothing, because #42
  wired the page to the chain and the relay only. The `createAuction` hash already shows, read from
  `AuctionCreated`. `quorumSigned` does not.

Two criteria are stale after #47:

- The Payout Cap is derived, not fixed. It is `maxPrice` rounded up to the next `PAYOUT_CAP_BUCKET`
  of 250 USDC. A cap under the 500 quorum ceiling now means a `maxPrice` at or under 250.
- The `createAuction` rule caps `payoutCap` at `MAX_PAYOUT_CAP`, 750 USDC. Refusing above it is the
  demo: the buyer asks 800, Privy answers `policy_violation`, the buyer retries at 520 and funds.
  Cost: the cap leaks which 250 band `maxPrice` falls in. The fixed cap leaked nothing.

## Dev review

The Budget is the Payout Cap. The spend policy rule reads the `payoutCap` argument of
`createAuction`, and `createAuction` takes three arguments now: `policyHash`, `requirements`,
`payoutCap`.
