# Can the Circle Agent Stack create a wallet on Arc testnet, and can that wallet sign a contract call?

Status: resolved Type: research Blocked by: 05-arc-usdc-address-and-decimals.md,
12-arc-chain-id-and-rpc-endpoint.md

This is a priority row, not optional. Goal 7 in `docs/spec.md` says the supplier agent wallets come
from the Circle Agent Stack, so the Arc track's agentic-economy story rests on this answer. Do it
early, before the bid flow is wired.

Three things to establish, in this order:

1. A wallet can be created and funded with Arc testnet USDC.
2. That wallet can sign and broadcast a contract call, not only a transfer.
   `commit(auctionId, commitment)` is the call that matters, because it also needs an ERC-20
   approval first.
3. That wallet can produce an EIP-712 signature over the `Bid` type, or the agent signs the bid with
   a separate local key while the Circle wallet signs the chain calls.

If item 3 fails, say so plainly and record which half went where. The bid signature and the chain
call do not have to come from the same key, but they do have to come from the same address, because
`commit` pulls the Stake from the caller and the Enclave checks that the bid signer staked.

The fallback is `createLocalSigner`, a viem externally owned account, which already exists so the
tests run without a Circle wallet. Taking the fallback loses goal 7 and weakens the Arc submission,
so take it only after this row is answered and answered no.

## Acceptance criteria

- [x] Row V7 is answered on all three items, in order: wallet created and funded, contract call
      signed and broadcast, EIP-712 signature over `Bid`.
- [x] If item 3 fails, the ticket records which key signed the bid and which signed the chain calls,
      and that both resolve to one address.
- [x] The transaction hash for a `commit` call from a Circle wallet is in `docs/evidence/`, or the
      failure is. `approve` stands in for `commit` until `SealedAuction` is deployed.

## Comments

Yes on all three items, with the signature check changed.

Item 1. The wallet is created by the first `circle wallet login <email> --testnet`, one per
supported chain, so `circle wallet create` is never needed. `ARC-TESTNET` is on the CLI's chain list
at chain id 5042002 even though `wallet login --help` omits Arc from the provisioning list. Circle's
own faucet funds it: `circle wallet fund --token usdc` drips 20 USDC, which is under the 50 USDC
`STAKE`, so an agent needs more than one drip.

Item 2. `approve(address,uint256)` on the USDC ERC-20 interface broadcast from the wallet,
`state: COMPLETE`, and the allowance reads back as `50000000`. `SealedAuction` is not deployed yet,
so `approve` stands in for `commit`; the spender is a placeholder and the `commit` hash follows
deployment.

Item 3. `circle wallet sign typed-data` signs the `Bid` type, but a Circle agent wallet is an
ERC-4337 smart contract account. The 65-byte signature recovers to the account's owner key
`0x76530A6f14b60163341aE9aA494E0E67A4cB9B61`, never to the wallet
`0x4d932db1979443e6abe8a5c57171e31ea9620484`. So `ecrecover` alone would drop every Circle-signed
bid.

One key signs everything and one address holds everything. The owner key signs both the Bid and,
through the account, the chain calls; the wallet is the address that stakes, wins and gets paid. The
Enclave binds them with ERC-1271 instead of `ecrecover`:
`eth_call isValidSignature(digest, signature)` on the supplier address returned the magic value
`0x1626ba7e` for the same digest and signature. That is now in `docs/spec.md`, in the Bid section,
the Sealed Bid Enclave bullet and Scoring step 1. It costs one `eth_call` per bid inside
`handlerInTee`, which build ticket work has to carry.

No fallback to `createLocalSigner`. It stays for tests only, and `ecrecover` is tried before
ERC-1271 so it keeps working.

Two limitations found on the way, both recorded in the evidence and in `docs/demo.md`:

- Spending policies are mainnet only. `circle wallet limit` refuses a testnet chain, so no
  supplier-side limit can be shown on Arc testnet. Buyer-side control stays the Privy half.
- The CLI authenticates as a Circle user against `agentic-wallet.circle.com` on the
  `/v1/w3s/user/...` endpoints, with a `userToken` from email OTP. It never uses a console API key,
  and it has no flag to accept one, so Circle Console API Logs stay at zero for these runs.

Evidence and the exact output: `docs/evidence/07-circle-agent-stack-wallets.md`.
