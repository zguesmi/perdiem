# Can one workflow run issue two writes to the same contract: `startSettling`, then the settlement?

Status: resolved Type: research Blocked by: 01-cre-simulate-writes-to-arc.md

If not, the claim and the settlement go on separate cron ticks, and the simulation cron drops to 20
seconds so the demo does not stall waiting for the second tick.

## Acceptance criteria

- [x] Row V8 is answered yes or no.
- [ ] If no, the cron interval for the demo is recorded, and `docs/spec.md` is updated from 60
      seconds. Not applicable: the answer is yes.

## Comments

## Answer

Yes. One `handlerInTee` run made two `writeReport` calls to the same contract on Arc testnet, both
`TxStatus.SUCCESS`, both carrying the same `workflowExecutionId`. The mock forwarder does not
deduplicate on it.

The second write sees the state the first committed. The throwaway receiver reverts a settlement
report unless a claim report has already moved it to `Settling`, and the settlement report's
recorded `phaseBefore` was `1`. A `callContract` read between the two writes returned the new phase,
and that read runs against the latest mined block, so `writeReport` blocks until its transaction is
mined. The two writes are sequential, not racing: nonces 24 and 25, blocks 61229528 and 61229531,
two seconds apart. Reversed, the settlement report reverted with `NotClaimed(0)` and the claim
report then succeeded, which is the control.

Each `writeReport` costs about 1.4 seconds, so two writes cost 2.8 seconds. `runtime.report(...)`
costs 3 to 6 ms.

The cron interval stays at 60 seconds and `docs/spec.md` is unchanged. A worst-case tick lands 60
seconds after `bidDeadline`, which is creation + 90 s, and `finalizeDeadline` is creation + 180 s.
Two writes and scoring three bids leave about 27 seconds spare.

`startSettling(bytes32)` cannot stay a distinct function that the forwarder calls. The `evm@1.0.0`
capability has one write RPC, `writeReport`, with no calldata field, so every CRE write arrives as
`onReport(bytes,bytes)`. The claim has to be a second report with a kind field in its body:
`report.reportId()` is `0001` for both reports in a run, so the kind cannot live there.

A reverted report is still invisible to the workflow. Both the skipped receiver of row V1 and a
reverting `onReport` report `txStatus=2` with `errorMessage` unset, and only
`ReportProcessed.result` says otherwise.

Evidence: `docs/scratch/verification/evidence/08-two-writes-per-workflow-run.md`.
