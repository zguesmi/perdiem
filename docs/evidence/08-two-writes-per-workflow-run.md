# Evidence: two chain writes in one workflow run

Run date: 2026-09-09. Answers `docs/scratch/verification/issues/08-two-writes-per-workflow-run.md`
and row V8 of `docs/decisions.md`.

CRE CLI `v1.32.0`, `@chainlink/cre-sdk` 1.20.0, template `hello-confidential-workflows-ts`, solc
0.8.34. The project was scaffolded in a scratch directory, not in `workflow/`, so nothing in the
repo depends on it. One throwaway receiver was deployed to Arc testnet. The signing key was
`BUYER_PRIVATE_KEY`, supplied to the CLI as `CRE_ETH_PRIVATE_KEY`, and is never printed here.

## 1. `writeReport` is the only write the EVM capability has

The generated `evm@1.0.0` client exposes nine RPCs: `callContract`, `filterLogs`, `balanceAt`,
`estimateGas`, `getTransactionByHash`, `getTransactionReceipt`, `headerByNumber`, `logTrigger`,
`writeReport`. There is no `sendTransaction` and no calldata field on a write request:

```ts
// node_modules/@chainlink/cre-sdk/dist/generated-sdk/.../evm/v1alpha/client_sdk_gen.d.ts
export type WriteCreReportRequestJson = {
	receiver: string
	report?: Report
	gasConfig?: GasConfigJson
}
```

So every write a workflow makes arrives at the receiver as `onReport(bytes metadata, bytes report)`.
A workflow cannot call an arbitrary function on the receiver.

`receiver` is a hex address, not base64. Passing base64 fails inside the enclave with
`Invalid hex string: lWIeXgOt+fWONKS7/cwFU0wdKNU=`.

## 2. The receiver under the two writes

`TwoWriteProbe` on Arc testnet at `0x95621e5e03adf9f58e34a4bbfdcc05534c1d28d5`, deployed in tx
`0x80846de53a82b2f00de3565dc2125ef82af1b85878e733924f6c33bf352a5d06`, block 61229123. It is a
stand-in for the `Bidding → Settling → Finalized` half of `SealedAuction`. The report body is
`abi.encode(uint256 kind)`, `1` for the claim and `2` for the settlement:

```solidity
uint256 kind = abi.decode(report, (uint256));
uint8 before = phase;
if (kind == 1) {
    if (before != 0) revert AlreadyClaimed(before);
    phase = 1;
} else if (kind == 2) {
    if (before != 1) revert NotClaimed(before);
    phase = 2;
}
records.push(Rec(uint8(kind), before, uint64(block.number), uint64(block.timestamp), execId, reportId));
```

The settlement report reverts unless the claim report has already committed `phase == 1`, so the
recorded `phaseBefore` is what the second write actually read. `supportsInterface` answers
`0x01ffc9a7` and `0x805f2132` only, per row V1.

## 3. Two writes in one run, and the second sees the first

One `handlerInTee`, one cron tick. It reads `phase`, writes the claim, reads `phase` again, writes
the settlement, reads `phase` a third time. Both writes go through `runtime.usingTheDons()`, because
`TeeRuntime` has no `report`.

```
$ cre workflow simulate v8 --non-interactive --target staging-settings --trigger-index 0 -e .env --broadcast
✓ Workflow compiled
  Binary hash: dff2d8a8f72dcfa586621c4468b81f3f75b03fce9c7b25ede84541ea2e682f8a
  Config hash: 791fc12d6650a8257a8513760f3dc04af3ccba97ad2d3c37ad77e9c0e9549977

Running trigger trigger=cron-trigger@1.0.0
╭─ Trigger requested TEE Execution your trigger will run in one of the following Tees:
│     - AWS Nitro in us-west-2
╰─

[USER LOG] phase-before=0
[USER LOG] write1-claim reportId=0001 execId=a5fea21caa0e0d59d795c9a531e038a72444bc1c1c0e9f97f9856fff0d05be89 reportMs=3
[USER LOG] write1-claim txStatus=2 txHash=0x60ccb097a55aa4a1be458be71c7b1b5734e9975cb9253f737c3b21e8cf76ba90 receiverStatus=0 error=none writeMs=1398
[USER LOG] phase-after-write1=1
[USER LOG] write2-settle reportId=0001 execId=a5fea21caa0e0d59d795c9a531e038a72444bc1c1c0e9f97f9856fff0d05be89 reportMs=6
[USER LOG] write2-settle txStatus=2 txHash=0xcd616518e462b997bd88219cf163541f2819e0233ffe8955b7b2098fd346d01f receiverStatus=0 error=none writeMs=1397
[USER LOG] phase-after-write2=2
[USER LOG] recordCount=2

✓ Workflow Simulation Result:
"phase-before=0 | … | phase-after-write2=2 | recordCount=2"

real	0m9.747s
```

Both writes are `TxStatus.SUCCESS`. Read back from Arc:

```
tx 0x60ccb097a55aa4a1be458be71c7b1b5734e9975cb9253f737c3b21e8cf76ba90
  from 0x746e3d03d7ba18657de97ee95aa1a1654e925d4d to 0x6e9ee680ef59ef64aa8c7371279c27e496b5edc1 nonce 24
  block 61229528 ts 1788952486 status success gasUsed 177282
  ReportProcessed execId=0xa5fea21c… reportId=0x0001 result=true
tx 0xcd616518e462b997bd88219cf163541f2819e0233ffe8955b7b2098fd346d01f
  from 0x746e3d03d7ba18657de97ee95aa1a1654e925d4d to 0x6e9ee680ef59ef64aa8c7371279c27e496b5edc1 nonce 25
  block 61229531 ts 1788952488 status success gasUsed 125985
  ReportProcessed execId=0xa5fea21c… reportId=0x0001 result=true

phase 2
recordCount 2
  record[0] kind=1 phaseBefore=0 block=61229528 ts=1788952486
  record[1] kind=2 phaseBefore=1 block=61229531 ts=1788952488
```

- Two transactions, same signing EOA, nonces 24 and 25, blocks three apart, two seconds apart.
- Same `workflowExecutionId` on both, so both belong to one run. The mock forwarder does not
  deduplicate on it.
- `record[1].phaseBefore == 1`, so the settlement report read the state the claim report committed.
- The read between the two writes returned `phase-after-write1=1`, and `callContract` runs against
  the latest mined block, so `writeReport` blocks until its transaction is mined. The two writes are
  sequential, not racing.

## 4. The control: the same two writes, reversed

`reset()`, then the settlement first and the claim second.

```
[USER LOG] phase-before=0
[USER LOG] write1-settle txStatus=2 txHash=0xdcee1753d8d34220a81c99aec89be08282a1e1b10da524cf5036ff31a0c28777 receiverStatus=0 error=none
[USER LOG] phase-after-write1=0
[USER LOG] write2-claim txStatus=2 txHash=0x8e666426714824539c856a66f02abafb5c676d34f873101237541d45236600ca receiverStatus=0 error=none
[USER LOG] phase-after-write2=1
[USER LOG] recordCount=1
```

```
tx 0xdcee1753…  block 61229409 status success gasUsed 67846
  ReportProcessed reportId=0x0001 result=false
tx 0x8e666426…  block 61229411 status success gasUsed 160110
  ReportProcessed reportId=0x0001 result=true
phase 1
recordCount 1
  record[0] kind=1 phaseBefore=0 block=61229411
```

An `eth_call` of the same report at block 61229408, with `from` set to the forwarder, names the
revert:

```
error.data 0xd593bf5f0000000000000000000000000000000000000000000000000000000000000000
decoded    NotClaimed(0)
```

The forwarder caught that revert, and the workflow still read `txStatus=2` with `errorMessage`
unset. Only `ReportProcessed.result` says it failed, and the workflow never sees it. Same finding as
row V1, now on the settlement path.

## 5. Timings

- `runtime.report(...)`: 3 ms and 6 ms.
- `evm.writeReport(...)`: 1398 ms and 1397 ms, so two writes cost 2.8 s of the run.
- Whole `cre workflow simulate`, including compile: 9.7 s.

## 6. Both reports carry the same `reportId`

`report.reportId()` is `0001` for both, and the receiver reads `0x0001` out of `metadata` both
times. A receiver cannot tell the claim from the settlement by `reportId`. The discriminator has to
be in the report body.

## 7. What this means for `startSettling`

- Two writes per run work, so the claim and the settlement do not need separate cron ticks. The
  simulation cron stays at 60 seconds and `docs/spec.md` needs no change.
- The demo has 90 seconds of slack: `bidDeadline` is creation + 90 s and `finalizeDeadline` is
  creation + 180 s. A worst-case tick lands 60 s after `bidDeadline`, the two writes cost 2.8 s and
  scoring three bids costs 30 ms per row V3, so the settlement lands with about 27 s spare.
- `startSettling(bytes32)` cannot stay a distinct function that the forwarder calls. Section 1 shows
  the only write is `writeReport`, which always lands on `onReport(bytes,bytes)`. The claim has to
  be a second report with a kind field in its body, and section 6 shows the kind cannot live in
  `reportId`.
- A rejected settlement is still distinguishable from a workflow that never ran, which is what
  `startSettling` exists for: the claim report moves the auction to `Settling` and the settlement
  report is a separate transaction.

## What this does not prove

- Simulation only, and the forwarder is a mock, per row V1. Nothing here says a production DON
  issues two writes per run, or that it waits for the first receipt before the second.
- Arc testnet block times were about 0.5 s during this run. A slower chain lengthens the 1.4 s per
  write.
- No upper bound was found on writes per run. Two were tried, not three or more.
