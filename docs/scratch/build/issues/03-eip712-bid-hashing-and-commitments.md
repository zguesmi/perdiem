# Implement the EIP-712 bid struct hash and the bid commitment

Status: resolved Type: task Blocked by: none (can start immediately)

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

## Answer

Implemented on `feat/eip712-bid-hash`, pull request #4.

The three hashes live in three files, so nothing can quietly use one where another belongs:

- `bidHash` in `packages/core/src/bid-hash.ts` is the EIP-712 `hashStruct` of the type written out
  in `docs/spec.md`. No salt, no domain. `bidTypes` is exported so a supplier agent signs with
  viem's `signTypedData` and never restates the member list.
- `bidSigningHash` in `packages/core/src/bid-signing-hash.ts` is
  `keccak256(0x1901 ‖ domainSeparator ‖ bidHash)`, with domain name `Perdiem`, version `1`, the Arc
  chain id and the `SealedAuction` address.
- `bidCommitment` in `packages/core/src/bid-commitment.ts` is
  `keccak256(abi.encode(bidHash, salt))`. The salt is not a member of the `Bid` type, so a signature
  is checkable without it and the commitment cannot be brute-forced with it.

`assertBid` rejects any field that does not fit the Solidity type it is hashed as: `stars` and
`numberOfRooms` as `uint8`, `distanceMeters` as `uint32`, `price` as a `uint256` bigint of USDC
minor units. Nothing is truncated, because a truncated field hashes one way in the agent and another
way in the Enclave, which drops the bid with only a count in the log.

`ARC_TESTNET_CHAIN_ID` in `packages/core/src/chain.ts` is the single constant. It records that
5042002 came from reading rather than from a connection and that
`../../verification/issues/12-arc-chain-id-and-rpc-endpoint.md` is still open. A test asserts the
fixture's domain chain id equals the constant, so a late answer fails as "the fixture is stale"
rather than as an anonymous hash mismatch.

Cross-language proof: `onchain/contracts/BidHash.sol` computes the same struct hash and the same
commitment, and `onchain/test/bid-hash-parity.test.ts` compares it against
`packages/core/fixtures/bid-hash.json`, which the TypeScript tests read as well. Neither side
computes its own expected value, and `onchain` has no dependency on `@perdiem/core`, so the two
implementations stay independent. Solidity matched viem on the first run. For bid C of the demo
table:

- `bidHash` `0x0f0852b5b8233fb29b2b76eb56e1fc486d9ca04c202b5376d6731102788e91fd`
- `commitment` `0x39640f3aed462f13d48967d995b63eb4140f288539c9bc6045f6c194508aafb4`
- `signingHash` `0x2b584fb721ae40d59b92e82752907df14580418ec3de20b1c33c09996e4c977b`

The signing hash has no Solidity side on purpose: nothing on chain verifies a bid signature, the
Enclave does. A Solidity domain separator would also have to take `chainId` as an argument, because
a Hardhat local chain reports 31337.

25 new tests pass in `packages/core` and 3 in `onchain`, with both typechecks clean. The remaining
red tests on that branch belong elsewhere: 7 in `packages/core` to ticket 02, and the two
`SealedAuctionTest` failures to ticket 04.

Left for ticket 19: the fixture is a plain file rather than an export, and it sits at
`packages/core/fixtures/` while ticket 02 put the Policy fixture at `packages/core/test/fixtures/`.
That ticket should settle on one location and add one regeneration script for all four hashes.

## Comments
