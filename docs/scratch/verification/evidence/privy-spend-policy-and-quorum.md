# Evidence: the buyer's spend policy and key quorum on Arc testnet

Run date: 2026-09-12. Answers `docs/scratch/build/issues/11-privy-funding-with-quorum.md`.

The app id, the app secret and the `Authorization: Basic` header are redacted. The two P-256
authorization keys are in `.env.arcTestnet` as `PRIVY_QUORUM_KEYS` and are not in the repository.
Signed transactions are truncated: each one is a broadcastable signature over nonce 0.

`SealedAuction` is deployed on Arc testnet at `0x95ca62b68899741BE9fF0b7EaB074e248008A33b`, against
the chain's own USDC at `0x3600000000000000000000000000000000000000`.

Objects on the Privy app after the run:

- policy `iaruxrhivn5eosuqqn2nz4lr` — "Hotel booking conditions", two `ALLOW` rules
- wallet `ivxhmunq96gjv7pwn4qac95z` — `0xB039A328e7e05c7034d5f76049718eBBeD017628`, no owner
- key quorum `a2ujs1hu183piifsaewnn6cn` — 2-of-2
- wallet `m6iq3wnqzlk8ra3u5guc1wit` — `0xc547496ef83C6acDC528ED608C68AC574a6bd77C`, owned by that
  quorum

Both wallets carry the policy. The policy was attached to the ownerless wallet with
`PATCH /v1/wallets/{id}`, `{"policy_ids": [...]}`, HTTP 200, replacing the chain-pin-only policy
`x8ua10zjj76xsx0jl86o3jqn` from the V6 run.

## 1. Privy accepts a calldata rule carrying the contract ABI

`POST /v1/policies` with both rules, HTTP 200. Each rule pins `chain_id` to `"5042002"` as a
string, names `method: eth_signTransaction`, and reads the calldata with
`field_source: ethereum_calldata` plus the JSON ABI of the function it names:

- `approve.spender` equal to `SealedAuction`, and `approve.value` at most 750000000, on the USDC
  token.
- `createAuction.payoutCap` at most 750000000, on `SealedAuction`.

The `abi` field takes the whole exported ABI array, not only the function the rule reads.

## 2. Eight signature requests, each answered as the policy states

`pnpm --filter @perdiem/purchaser privy:policy probe`. Nothing is broadcast, so no row costs gas or
changes state. Gas figures are fixed rather than estimated, because `createAuction` reverts until
its approval is mined.

```
ok  policy wallet: approve 250 to the auction
    0x02f8b4834cef5280843b9aca008506fc23ac0083030000943600…
ok  policy wallet: approve the maximum cap to a spender the policy never names
    Error: RPC request denied due to policy violation
ok  policy wallet: createAuction above the maximum cap
    Error: RPC request denied due to policy violation
ok  quorum wallet: approve the maximum cap, no quorum signature
    Error: Privy answered 401: {"error":"Missing `privy-authorization-signature` header or no signatures provided. …"}
ok  quorum wallet: approve the maximum cap, one quorum signature
    Error: Privy answered 401: {"error":"Number of signatures in `privy-authorization-signature` header does not match the wallet's authorization threshold."}
ok  quorum wallet: approve the maximum cap, both quorum signatures
    0x02f8b4834cef5280843b9aca008506fc23ac0083030000943600…
ok  quorum wallet: createAuction at the maximum cap, both quorum signatures
    0x02f902b5834cef5280843b9aca008506fc23ac00830300009495ca…
ok  quorum wallet: createAuction above the maximum cap, both quorum signatures
    Error: RPC request denied due to policy violation
```

Exit code 0. The script exits 1 if any row is signed where the policy states a refusal.

## 3. The spend policy is enforced for quorum-signed requests

The last row is the one that mattered: both owners signed the request and Privy still refused a
`payoutCap` above 750000000. An owner signature does not override the policy, so the refusal the
buyer sees on an over-budget request fires on the quorum wallet as well as the policy-only one.

## 4. Two wallets, because a wallet has one owner

The ceiling cannot be a per-signer override on one wallet. A Privy wallet has a single `owner_id`,
and a quorum-owned wallet refuses every request that carries fewer than its threshold of
signatures, so no path through it is authorized by the spend policy alone. The buyer therefore
holds two wallets and the purchaser service picks one by the payout cap.

## 5. The key quorum request field has been renamed

`POST /v1/key_quorums` with `authorization_keys`, as the V6 run sent it, now answers HTTP 400:

```json
{"error":"[Input error] ``: Unrecognized key(s) in object: 'authorization_keys'; ``: Must provide at least one of user_ids, public_keys, or key_quorum_ids","code":"invalid_data"}
```

The field is `public_keys`, an array of base64 SPKI strings. The response still reports the keys
under `authorization_keys`.

## Not verified

- No funding transaction has been mined. Both buyer wallets hold 1 USDC, and the smallest payout
  cap the service can derive is 250 USDC, so a live `POST /confirm` needs a faucet first.
- `PRIVY_SERVER_KEYS` is empty and unexercised: the policy-only wallet has no owner, so no request
  to it carries an authorization signature.
