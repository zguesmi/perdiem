# Give each supplier agent a Circle Agent Stack wallet

Status: ready-for-agent
Blocked by: none, but see docs/scratch/verification/issues/07-circle-agent-stack-wallets.md

Two signer implementations behind one interface, as `docs/spec.md` states under "Supplier agents".
`createLocalSigner` wraps a viem externally owned account and exists so the bid flow runs today.
`createCircleAgentSigner` wraps a Circle Agent Stack wallet and is the demo path.

The interface is the whole ticket. It needs exactly what the agent does: an address, an EIP-712
signature over the `Bid` type, and a contract write. Anything wider leaks the Circle client into the
bid flow and makes the fallback untestable.

The address is the same in both directions, because `commit` pulls the Stake from the caller and the
Enclave checks that the bid signer staked. A signer whose bid signature and whose chain calls come
from two addresses is a bug, and a test states it.

Do not start the Circle client until verification row 07 says a Circle wallet can sign a contract
call on Arc testnet. Write the interface and the local signer first; they are what the other tickets
depend on.

## Comments
