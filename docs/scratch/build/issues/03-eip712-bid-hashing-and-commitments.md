# Implement the EIP-712 bid struct hash and the bid commitment

Status: ready-for-agent
Blocked by: 02

The commitment is `keccak256(abi.encode(structHash(bid), salt))`, with the salt outside the
struct hash. Add the cross-language test: the Solidity hash and the TypeScript hash of the same bid
must match, or the enclave's commitment check rejects honest bids.

## Comments
