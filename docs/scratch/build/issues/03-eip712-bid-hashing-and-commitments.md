# Implement the EIP-712 bid struct hash and the bid commitment

Status: done Type: task Blocked by: none (can start immediately)

The chain id in the EIP-712 domain comes from
`../verification/issues/12-arc-chain-id-and-rpc-endpoint.md`, which is open. A wrong chain id
verifies locally, and the Enclave rejects the bid. Keep it in one constant, so a late answer costs
one line and a regenerated fixture rather than a rewrite.

Three hashes, and `docs/spec.md` keeps them apart on purpose: `bidHash` is the EIP-712 `hashStruct`
with no salt and no domain; the signature is over `keccak256(0x1901 ‖ domainSeparator ‖ bidHash)`;
the commitment is `keccak256(abi.encode(bidHash, salt))`. The salt stays outside the struct hash so
the signature can be checked without it.

The EIP-712 type and the domain are both written out in `docs/spec.md`. `distanceMeters` is a
`uint32` and not a fraction, and `price` is `uint256` minor units.

Add the cross-language test: the Solidity hash and the TypeScript hash of the same bid must match,
or the enclave's commitment check rejects honest bids. Ticket 19 turns that pair of tests into one
shared fixture, which is where the Bids Root joins them.

## Acceptance criteria

- [x] `bidHash` is the EIP-712 `hashStruct` of the type in `docs/spec.md`: no salt, no domain.
- [x] The signature is over `keccak256(0x1901 ‖ domainSeparator ‖ bidHash)`, with domain name
      `Perdiem`, version `1`, the Arc chain id and the `SealedAuction` address.
- [x] The Bid Commitment is `keccak256(abi.encode(bidHash, salt))`, and the salt appears in no
      struct hash.
- [x] One shared input produces the same `bidHash` and the same commitment in Solidity and in
      TypeScript.
- [x] `distanceMeters` is `uint32` and `price` is `uint256` minor units. No field in the struct is
      fractional.
- [x] The chain id reads from one constant, so verification 12 changes one line.

## Comments

## Dev review

Implemented in `shared/bid.ts`. The chain id is `ARC_CHAIN_ID` in `shared/chain.ts`, and nothing
else states it.

`price` is a safe integer in the `Bid` type, not a bigint: a Bid is JSON before it is anything else,
and `JSON.stringify` cannot encode a bigint. `bidMessage` widens it to a bigint at the one viem
boundary that needs it.

The salt is not a member of the `Bid` type at all. `docs/spec.md` shows it inside the bid object,
and the envelope carries it beside the bid instead, so it cannot reach `hashStruct` by accident.
