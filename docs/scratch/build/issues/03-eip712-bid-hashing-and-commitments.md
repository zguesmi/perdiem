# Implement the EIP-712 bid struct hash and the bid commitment

Status: ready-for-agent
Blocked by: 02

Three hashes, and `docs/spec.md` keeps them apart on purpose: `bidHash` is the EIP-712 `hashStruct`
with no salt and no domain; the signature is over `keccak256(0x1901 ‖ domainSeparator ‖ bidHash)`; the
commitment is `keccak256(abi.encode(bidHash, salt))`. The salt stays outside the struct hash so the
signature can be checked without it.

The EIP-712 type and the domain are both written out in `docs/spec.md`. `distanceMeters` is a
`uint32` and not a fraction, and `price` is `uint256` minor units.

Add the cross-language test: the Solidity hash and the TypeScript hash of the same bid must match, or
the enclave's commitment check rejects honest bids. Ticket 19 turns that pair of tests into one
shared fixture, which is where the Bids Root joins them.

## Comments
