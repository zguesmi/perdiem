# Evidence: `cre workflow simulate` writing to Arc testnet

Run date: 2026-09-09. Answers `docs/scratch/verification/issues/01-cre-simulate-writes-to-arc.md`
and row V1 of `docs/decisions.md`.

CRE CLI `v1.32.0`, `@chainlink/cre-sdk` 1.20.0. The project was scaffolded in a scratch directory,
not in `workflow/`, so nothing in the repo depends on it. Five throwaway receiver contracts were
deployed to Arc testnet to isolate the forwarder's behaviour.

The signing key was `BUYER_PRIVATE_KEY`, supplied to the CLI as `CRE_ETH_PRIVATE_KEY`. It is never
printed here. The second EOA in section 4 was generated for this run only and is not stored.

## 1. Arc is in the chain-selectors registry

`@chainlink/cre-sdk` ships `arc-testnet` as a generated network, so `--allow-unknown-chains` is not
needed:

```js
// node_modules/@chainlink/cre-sdk/dist/generated/chain-selectors/testnet/evm/arc-testnet.js
const network = {
    chainId: '5042002',
    chainSelector: {
        name: 'arc-testnet',
        selector: 3034092155422581607n,
    },
    chainFamily: 'evm',
    networkType: 'testnet',
};
```

The RPC goes in `project.yaml` under `rpcs` as `chain-name: arc-testnet`.

## 2. Simulation broadcasts only with `--broadcast`

```
--broadcast    Broadcast transactions to configured chains (default: false)
```

Without the flag the write is a no-op that still reports success:

```
[USER LOG] chain arc-testnet selector 3034092155422581607
[USER LOG] txStatus 2
[USER LOG] txHash none
```

`TxStatus` is `FATAL = 0`, `REVERTED = 1`, `SUCCESS = 2`, so `2` is `SUCCESS` with nothing on chain.

With the flag, the full run:

```
$ cre workflow simulate arcwrite --non-interactive --trigger-index 0 --broadcast
Initializing...
Loading settings...
Checking RPC connectivity...
Compiling workflow...
✓ Workflow compiled
✓ Simulation limits enabled
  HTTP: req=120kb resp=250kb timeout=10s | ConfHTTP: req=125kb resp=500kb timeout=1m30s |
  Consensus obs=25kb | ChainWrite evm_report=50kb evm_gas=10000000 solana_report=265b
  solana_cu=300000 | WASM binary=100mb compressed=20mb
  Binary hash: c7f148834d009d71cf33c8454875e9cad915d24b1d584de15bc7101409877f63
  Config hash: 28b4f721ae68264ee84405cbfe0975354f81389e839ee842b2b6ead9882f502d
2026-09-09T08:22:34Z [SIMULATION] Simulator Initialized

2026-09-09T08:22:34Z [SIMULATION] Running trigger trigger=cron-trigger@1.0.0
2026-09-09T08:22:34Z [USER LOG] chain arc-testnet selector 3034092155422581607
2026-09-09T08:22:35Z [USER LOG] txStatus 2
2026-09-09T08:22:35Z [USER LOG] txHash 0x33ff1e70bcd84aaaaedb37c491dab903bc0ad8b50b5733ef17319d25a3cd1998

✓ Workflow Simulation Result:
"0x33ff1e70bcd84aaaaedb37c491dab903bc0ad8b50b5733ef17319d25a3cd1998"

2026-09-09T08:22:35Z [SIMULATION] Execution finished signal received
2026-09-09T08:22:35Z [SIMULATION] Skipping WorkflowEngineV2
```

That hash is a real Arc testnet transaction, block 61209565, `status: success`, gas used 89652.

The CLI refuses well-known keys. The Hardhat test key `0x59c6…690d` returns:

```
[USER LOG] txStatus 1
[USER LOG] errorMessage Blocked address
✗ workflow execution failed: write failed: Blocked address
```

## 3. The forwarder

Every broadcast transaction goes to `0x6e9ee680ef59ef64aa8c7371279c27e496b5edc1`, calling
`report(address,bytes,bytes,bytes[])`, selector `0x11289565`, with four simulator-generated
signatures.

```
typeAndVersion() → "MockKeystoneForwarder 1.0.0-dev"
owner()          → 0x28b8e36c9642AeaD020289a5Dd5aEE9F9DcA51BE
isForwarder(0x6e9ee680ef59ef64aa8c7371279c27e496b5edc1) → true
```

It is a mock, deployed by someone else, already on Arc testnet. The CLI did not deploy it.

## 4. The forwarder address does not depend on the signing key

A second, freshly generated EOA funded with 1 USDC broadcast the same workflow:

```
tx 0x6cd571ef4477fec39b9ded339ac0262f8462b8c2bf39153cc36e44bff7a5a639
from 0x3d1e3e36ae84b610a4d77f20793d487b53d3c384
to   0x6e9ee680ef59ef64aa8c7371279c27e496b5edc1
ReportProcessed result: true
```

Same forwarder. So the address is a constant for the chain and can be a constructor argument fixed
at deploy time.

The mock validates nothing. The same EOA called `report(...)` on it directly, with an empty
signature array and one byte of the workflow execution id changed, and the receiver's `onReport`
ran:

```
tx 0xdc40d0d0b4bb701416feb604d280cb0460ad5859c83e12ffd9cc6573f5656678
status: success
receiver callCount: 2 → 3
```

## 5. The receiver must answer ERC-165 correctly

The forwarder probes the receiver before calling it. Its runtime bytecode carries
`PUSH4 01ffc9a7` (`supportsInterface(bytes4)`) and `PUSH4 ffffffff`.

Five receivers, same workflow, same forwarder:

| Receiver | `supportsInterface(bytes4 id)` returns  | `onReport`     | `ReportProcessed.result` | `onReport` ran |
| -------- | --------------------------------------- | -------------- | ------------------------ | -------------- |
| A        | `true`                                  | stores         | `false`                  | no             |
| B        | `true`, plus a `fallback()` recorder    | stores         | `false`                  | no             |
| C        | `id == 0x01ffc9a7 \|\| id == 0x805f2132` | stores         | `true`                   | yes            |
| D        | `id != 0xffffffff`                      | stores         | `true`                   | yes            |
| E        | `id == 0x01ffc9a7 \|\| id == 0x805f2132` | always reverts | `false`                  | yes, reverted  |

B is the one that shows where the rejection happens. Its `fallback()` records `msg.data` for any
selector, and it stayed empty. The forwarder made no call at all to the receiver.

D isolates the cause. It answers `true` to every interface id except `0xffffffff`, and it works. So
the single requirement is that `supportsInterface(0xffffffff)` returns `false`. `0x805f2132` is
both the `onReport(bytes,bytes)` selector and the `IReceiver` interface id, because the interface
has one function.

Transaction hashes:

```
0x4a54ef852cc6d4a4c8276abe4918e6bddd0b80688dab1024cd27678ac90c6761   A, result false
0x9c60138ba483a9bc5157602b887304b8910751b5d29cf8a3db78a6804718c404   B, result false
0xac91a1b15d655e265700412f73115d313e57d30aebfd64a8d830e173eacbef5e   C, result true
0x3b1ee702fe07d28e13ad89e0144224e8f08021349aefa9e10b39484f71dabb46   D, result true
0xb014d5cc944a6bc36eb9a0ab195eaaba5524d0834b88ca30efec92a1f79392e3   E, result false
```

E separates the two failure modes. Its `onReport` reverts with a custom error. The forwarder catches
the revert, so the transaction is `status: success` and the result is `false`. A skipped receiver and
a reverting receiver are indistinguishable from the workflow.

Receiver A, decoded from tx `0x4a54ef85…`:

```
ReportProcessed {
  receiver: 0xdCE80eCFa93443Ad95A8519525a1880558841F60,
  workflowExecutionId: 0x93af5560bd7aa3cb22a3c21dd00c3c508fbf2bf34f5a077a9982ece0a6b1e9af,
  reportId: 0x0001,
  result: false
}
```

Transaction `status: success` and `txStatus 2` on all five. A failed receiver call is reported only
in `ReportProcessed.result`, which the workflow never sees. A settlement that never executed looks
identical to one that did, from every layer the workflow can read.

## 6. What the receiver is handed

From receiver C, tx `0xac91a1b1…`:

```
lastSender   0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1
lastMetadata 0x1111111111111111111111111111111111111111111111111111111111111111
               36343430633734353131
               aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
               0001
lastReport   0x000000000000000000000000000000000000000000000000000000000000002a
```

`msg.sender` is the forwarder. `metadata` is 64 bytes: `workflowId(32) ‖ workflowName(10) ‖
workflowOwner(20) ‖ reportId(2)`. `report` is the payload the workflow passed to
`prepareReportRequest`, here `abi.encode(uint256 42)`.

In simulation `workflowId` is `0x1111…` and `workflowOwner` is `0xaaaa…`. Both are placeholders,
confirmed by the verbose run:

```
WorkflowOwner: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
WorkflowName: arcwrite
WorkflowID: 1111111111111111111111111111111111111111111111111111111111111111
DonID: 1  DonF: 0  DonN: 1
```

`SealedAuction.onReport` cannot gate on either value.

## What this does not prove

- The forwarder is a mock. Nothing here says a production CRE DON writes to Arc testnet, or that
  the address stays the same when one does.
- The mock checks no signatures, so `onlyForwarder` bounds who can call `onReport` to one address
  that anyone can route a call through. On Arc testnet the Policy Hash, Bids Root and Budget checks
  inside `onReport` are what actually constrain a settlement.
- Nothing was deployed to a DON. Deployment still needs beta enrollment, per row V10.
