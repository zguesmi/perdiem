# Evidence: a Privy-signed funding run mined on Arc testnet

Run date: 2026-09-12. Answers `docs/scratch/build/issues/11-privy-funding-with-quorum.md`.

The first funding to reach Arc through the purchaser service. Every earlier transaction on this
deployment was broadcast by Hardhat, by viem or by curl.

Setup: `SealedAuction` at `0x95ca62b68899741BE9fF0b7EaB074e248008A33b`, USDC at
`0x3600000000000000000000000000000000000000`, buyer wallet
`0xB039A328e7e05c7034d5f76049718eBBeD017628`, no owner.

`PAYOUT_CAP_BUCKET` was 25 USDC for this run, not the deployment's 250. The buyer wallet held 54
USDC and no faucet was available, so a 250 USDC cap could not be pulled. Nothing else was changed:
the same spend policy, the same two signed transactions, the same broadcast path.

## 1. A payout cap under the ceiling funds on the spend policy alone

`POST /confirm` with a 20 USDC maximum price, HTTP 200:

```json
{
  "policyHash": "0x0b17812c7147234b724378cd641d8285a28836a92216acc177d9b1774b3f806f",
  "payoutCap": "25000000",
  "auctionId": "0x0da2387d3ccf7451a3c369978c5f71d02490841a7b6e3bbb139687a997fa5f3b",
  "approveHash": "0x0184391de1684c77cb61568d4687d25e7defb763c7d638d04d783b8c7c08924e",
  "createAuctionHash": "0x383da2d0c89943971843029e1ea1f91f6f47e552f0905031cf0ad92af52d0e5d",
  "quorumSigned": false
}
```

Both transactions mined. Privy signed with `eth_signTransaction` and the purchaser service
broadcast the RLP to `ARC_RPC_URL`.

## 2. A payout cap over the maximum is refused before anything is signed

`POST /confirm` with an 800 USDC maximum price, HTTP 422:

```json
{ "error": "RPC request denied due to policy violation", "payoutCap": "825000000" }
```

No transaction was produced. The refusal reaches the buyer as an answer, not a fault.

## 3. The page can reach the service cross-origin

`OPTIONS /confirm` from `http://localhost:5173`: HTTP 204,
`access-control-allow-origin: http://localhost:5173`, `access-control-allow-methods: POST`.

That run allowed every origin. The service was narrowed to the one origin afterwards, and a test
asserts that any other origin gets no allow header.

## Not covered

- The quorum path. A cap above the 500 USDC ceiling needs 500 USDC in the quorum wallet. The
  refusal above fires on either wallet, so only the two-approval signature itself is unproven on a
  mined transaction.
- The 250 USDC bucket the deployment runs with.
- The page itself in a browser. It typechecks and builds; no browser was available to drive it.
