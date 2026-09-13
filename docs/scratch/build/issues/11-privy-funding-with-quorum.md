# Fund the auction from a Privy organization wallet

Status: done Type: task Blocked by: 04, 10

The organization wallet signs `createAuction`. Its spend policy allows USDC transfers to the
`SealedAuction` contract and nothing else. The key quorum is dropped: see the 2026-09-13 note.

This is the B2B workflow the Privy prize asks for, so it has to actually work, not be described.

## Acceptance criteria

- [x] The organization wallet signs `createAuction` on Arc testnet, and the transaction hash appears
      on the page. Signed, mined, and driven from a browser.
- [x] The spend policy has two `ALLOW` rules, both reading the calldata with
      `field_source: ethereum_calldata` and the contract ABI: `approve(spender, value)` on the USDC
      ERC-20 with `spender` equal to `SealedAuction`, and `createAuction(...)` on `SealedAuction`
      with the Payout Cap within the ceiling. Every rule pins `chain_id` to 5042002 and uses
      `method: eth_signTransaction`.
- [x] A refused `approve` to another spender is captured as evidence.
- [x] A Payout Cap at or under the ceiling passes on the policy alone. That is the path the tests
      use. Proven at the configured bucket, with no figure changed for the run.
- [x] The purchaser service broadcasts the signed transaction to `ARC_RPC_URL`. Privy will not
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

### 2026-09-12 — the policy and the quorum are live, no funding has been mined

`SealedAuction` is deployed on Arc testnet at `0x95ca62b68899741BE9fF0b7EaB074e248008A33b`.
Evidence: `docs/scratch/verification/evidence/privy-spend-policy-and-quorum.md`.

Settled by the run:

- The two calldata rules are attached to both buyer wallets, and nine signature requests are each
  answered as the policy states. The probe exits 1 if any row is signed where a refusal is stated.
- The spend policy is enforced for quorum-signed requests. Both owners sign and Privy still refuses
  a `payoutCap` above the maximum, so the over-budget refusal fires on either wallet.
- The snake_case transaction fields and the `chain_id` string in the condition are correct as sent.
- `POST /v1/key_quorums` now takes `public_keys`, not the `authorization_keys` the V6 run sent.
- The ceiling cannot be a per-signer override. A Privy wallet has one owner, and a quorum-owned
  wallet refuses any request under its threshold, so the buyer holds two wallets and the service
  picks one by the payout cap.

Left:

- A mined funding run. Both buyer wallets hold 1 USDC and the smallest derived cap is 250 USDC, so
  `POST /confirm` needs a faucet. No Privy-signed transaction has reached Arc through the purchaser
  service. The deployment and the gas transfers were broadcast from the deployer key by Hardhat and
  by viem, and the one quorum-signed transfer on chain was broadcast by curl during the V6 run.
- The page has to call `POST /confirm` and show `quorumSigned`.

### 2026-09-12 — the page funds an auction, and the funding mined

The page calls both routes. `New auction` takes one sentence, `POST /intent` answers with the
summary, and the buyer confirms it. `POST /confirm` returns the funding, and the Funding panel names
who authorized it and shows the `approve` hash beside the `createAuction` hash already read from
`AuctionCreated`.

The purchaser service answers a cross-origin `POST`, because the page and the service are two
origins.

First funding to reach Arc through the service. Evidence:
`docs/scratch/verification/evidence/privy-funding-mined-on-arc.md`.

- A 25 USDC cap funded on the spend policy alone. Both transactions mined.
- An 825 USDC cap was refused with `policy_violation` before anything was signed.
- `PAYOUT_CAP_BUCKET` was 25 USDC for the run, not 250. The buyer wallet holds 54 USDC and no faucet
  was reachable.

Left: the quorum path on a mined transaction. It needs 500 USDC in the quorum wallet. The page also
has not been driven in a browser; no browser was available.

### 2026-09-13 — the amounts fit a testnet and the funding is browser-driven

Every figure is a hundredth of what it was: maximum price 5.2, payout cap 7.5, stake 0.5, bucket
2.5. `MAX_PAYOUT_CAP` is 7500000 and `PRIVY_QUORUM_CEILING` matches it.

`SUPPLIER_STAKE`, `BID_PERIOD` and `FINALIZE_PERIOD` are constructor arguments now, so a deployment
sets them: 0.5 USDC, 30 seconds and 1800 seconds. They were constants of 50 USDC, 2 hours and 4
hours, which no demo can wait out.

`SealedAuction` is redeployed on Arc testnet at `0xd393D72732D33f38Dd1349Dfd0c35858F9fE9052`. The
spend policy `uvv6wlc0qqesnns48w51jy8l` is written against that address with a 7500000 bound and
attached to the ownerless buyer wallet.

Closed by the run:

- The page ran in headless Chromium. One sentence, `POST /intent`, the buyer confirms,
  `POST /confirm`, both funding transactions mined, and the auction renders with a 7.5 USDC payout
  cap.
- The cap needs no lowered bucket: 5.2 rounds up to 7.5 at the configured `PAYOUT_CAP_BUCKET`.
- `VITE_FROM_BLOCK` is written by the deploy script. Arc answers a page reading from block zero with
  `pruned history unavailable`, and every panel stays empty.

Left:

- The quorum path. `PATCH /v1/wallets/{id}` on the quorum wallet answers 401 without a quorum-signed
  `privy-authorization-signature`, and that wallet holds 1 USDC. Nothing fires it while the ceiling
  equals the maximum cap.

### 2026-09-13 — the key quorum is dropped, and the ticket is closed

The quorum is out of scope. `PRIVY_QUORUM_CEILING` equals `MAX_PAYOUT_CAP`, so the spend policy
authorizes every auction on its own and no request carries a second signature.

Why it is dropped rather than deferred:

- `PATCH /v1/wallets/{id}` on the quorum wallet answers 401 without a quorum-signed
  `privy-authorization-signature`, so the current spend policy is attached to the ownerless wallet
  alone.
- That wallet holds 1 USDC against a 7.5 payout cap, so a quorum-signed funding cannot mine without
  a top-up.
- Nothing else in the demo depends on it. The refusal that the video shows is the spend policy
  answering `policy_violation` above the maximum cap, and that fires on either wallet.

What stays: two wallets, `signerFor`, the `quorumSigned` field and the panel that renders it. The
code path is tested and unused. Lowering the ceiling puts the quorum back without a code change.

The claim to make is "the organization's spend policy authorizes the buyer's service, and refuses it
above budget", not "two people approved".

## Dev review

The Budget is the Payout Cap. The spend policy rule reads the `payoutCap` argument of
`createAuction`, and `createAuction` takes three arguments now: `policyHash`, `requirements`,
`payoutCap`.
