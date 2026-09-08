# Can the Circle Agent Stack create a wallet on Arc testnet, and can that wallet sign a contract call?

Status: ready-for-human Type: research Blocked by: 05-arc-usdc-address-and-decimals.md,
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

- [ ] Row V7 is answered on all three items, in order: wallet created and funded, contract call
      signed and broadcast, EIP-712 signature over `Bid`.
- [ ] If item 3 fails, the ticket records which key signed the bid and which signed the chain calls,
      and that both resolve to one address.
- [ ] The transaction hash for a `commit` call from a Circle wallet is in `docs/evidence/`, or the
      failure is.

## Comments
