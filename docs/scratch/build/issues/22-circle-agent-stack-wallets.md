# Give each supplier agent a Circle Agent Stack wallet

Status: done Type: task Blocked by: none (can start immediately; see
../verification/issues/07-circle-agent-stack-wallets.md before the Circle client)

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

## Acceptance criteria

- [x] One signer interface with exactly three members: the address, an EIP-712 signature over the
      `Bid` type, and a contract write.
- [x] `createLocalSigner` passes the interface tests today, with no Circle account.
- [x] `createCircleAgentSigner` sits behind the same interface and configuration chooses it, not by
      a code change.
- [x] One test states that the signing address and the writing address are the same.
- [x] No Circle type appears anywhere in the bid flow.

## Comments

Done. `createCircleAgentSigner` is in `agents/src/circle.ts` and drives the Circle CLI: there is no
API-key client to write, because the CLI authenticates as a Circle user with a session from an email
one-time code and accepts no API key. `AGENT_SIGNER` picks the implementation and defaults to
`local`, so nothing but an environment variable moves an agent onto its Circle wallet.

`agents/test/signer.test.ts` covers both: the local signer's bid signature recovers to the address
it writes from, and the Circle signer passes one `--address` to `wallet sign typed-data` and to
`wallet execute`. The Circle CLI call is injected in the tests, so they need no Circle session.

Not run against a live Circle session. Row V7 broadcast an `approve` from the wallet by hand, and
this signer builds the same call, but nothing here has been through the CLI end to end.

## Dev review

Not reviewed yet.
