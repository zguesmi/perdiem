# Does `cre workflow simulate` broadcast a real write to Arc testnet, and which forwarder address does it use?

Status: closed Type: research Blocked by: 10-confidential-workflows-beta-access.md,
12-arc-chain-id-and-rpc-endpoint.md

The contract accepts settlements only from the CRE forwarder, so the forwarder address is a
constructor argument. If simulation does not broadcast, the demo needs a different story for the
settlement transaction.

Record the forwarder address in `docs/decisions.md` and save the simulation output to
`docs/evidence/`.

## Acceptance criteria

- [x] Row V1 in `docs/decisions.md` is answered, with the forwarder address written out.
- [x] The simulation output is saved in `docs/evidence/`.
- [x] If simulation does not broadcast, the ticket records what the demo's settlement transaction is
      instead. It does broadcast, so no alternative is needed.

## Answer

It broadcasts, but only with `--broadcast`. The flag defaults to `false`. The signing key is
`CRE_ETH_PRIVATE_KEY` in the project `.env`, and it has to hold Arc testnet USDC.

The forwarder is `0x6e9ee680ef59ef64aa8c7371279c27e496b5edc1`. `typeAndVersion()` returns
`MockKeystoneForwarder 1.0.0-dev`. It was already deployed on Arc testnet, owned by
`0x28b8e36c9642AeaD020289a5Dd5aEE9F9DcA51BE`, and the CLI did not deploy it. A second, unrelated EOA
got the same address, so it is a constant for the chain and can be a constructor argument.

`arc-testnet` is a generated network in `@chainlink/cre-sdk` 1.20.0, chain id 5042002, selector
`3034092155422581607`. `--allow-unknown-chains` is not needed. The RPC goes in `project.yaml` as
`chain-name: arc-testnet`.

Evidence:
[01 — CRE simulate writing to Arc testnet](../../../evidence/01-cre-simulate-writes-to-arc.md).

### Three things the spec did not account for

`TxStatus.SUCCESS` does not mean the settlement executed. It means the forwarder transaction was
mined. Three separate failures all report `TxStatus.SUCCESS`:

- No `--broadcast`. Nothing reaches the chain and `txHash` is `none`.
- The forwarder skipped the receiver. The transaction is `status: success` on chain, and
  `ReportProcessed.result` is `false`.
- The receiver reverted inside `onReport`. The forwarder swallows it the same way.

The forwarder probes ERC-165 before it calls a receiver. A receiver that returns `true` for
`supportsInterface(0xffffffff)` is skipped, with no call at all. This was isolated with four
deployed receivers. `SealedAuction` needs `supportsInterface` to answer `true` for `0x01ffc9a7` and
the `IReceiver` id `0x805f2132`, and `false` for everything else. `docs/spec.md` now carries this,
with a test on the `0xffffffff` answer.

The `metadata` argument holds a placeholder workflow id `0x1111…` and workflow owner `0xaaaa…` in
simulation. `onReport` cannot gate on either.

### Limitation

The mock forwarder validates no signatures. A random EOA called `report(...)` on it directly, with
an empty signature array, and the receiver's `onReport` ran. So `onlyForwarder` narrows callers to
one address that anyone can route through. On Arc testnet the Policy Hash, Bids Root and Budget
checks inside `onReport` are what constrain a settlement. `onlyForwarder` stays on the contract: it
is correct against a real forwarder, and removing it would be wrong when one exists.

### Unblocked by this

Tickets 02, 03, 04, 08 and 13.

## Comments
