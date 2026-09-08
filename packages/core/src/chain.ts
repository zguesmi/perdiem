/**
 * The chain id inside the EIP-712 domain. Every supplier signature is bound to it, so a wrong value
 * verifies locally and the Enclave rejects the bid: it reads as "the agents sign wrong" rather than
 * "the domain is wrong".
 *
 * 5042002 is what `docs/spec.md` states. It came from reading, not from a connection:
 * `docs/scratch/verification/issues/12-arc-chain-id-and-rpc-endpoint.md` is still open. It is one
 * constant so that a late answer costs this line and a regenerated fixture, not a rewrite.
 */
export const ARC_TESTNET_CHAIN_ID = 5042002;
