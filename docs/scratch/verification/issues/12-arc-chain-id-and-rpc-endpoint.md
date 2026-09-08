# What is the Arc testnet chain id and public RPC endpoint?

Status: ready-for-agent

`docs/spec.md` states chain id 5042002 in three places, and `docs/decisions.md` has no row for it. It
came from reading, not from a connection. Everything downstream assumes it: the Hardhat network
entry, the EIP-712 domain separator, the Privy policy's chain scope, and every viem client.

A wrong chain id in the EIP-712 domain is the expensive failure. Signatures verify locally against
the wrong domain and are rejected by the Enclave, which reads as "the agents are signing wrong"
rather than "the domain is wrong".

Confirm from a connection, not from a page: chain id, the public RPC URL, whether a websocket
endpoint exists, and the explorer base URL the page links transaction hashes to. Record all four in
`docs/decisions.md` with the command that produced them.

Answerable from the Arc documentation and one `eth_chainId` call, so an agent can close it.

## Comments
