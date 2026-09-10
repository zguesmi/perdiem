# Implement the SealedAuction state machine and escrow

Status: ready-for-agent Type: task Blocked by: 01

USDC on Arc testnet has 6 decimals, verified on chain, so `SealedAuction.t.sol` hardcoding `750e6`
is correct. See `../verification/issues/05-arc-usdc-address-and-decimals.md`.

Created, Bidding, Settling, Finalized, Timeout. `createAuction` pulls the Payout Cap, `commit` pulls
the Stake, `_startSettling` claims the auction for the workflow, the settlement pays and refunds,
`submitReceipt` releases the winner's Stake, `slash` pays it to the buyer, `timeoutRefund` is the
escape hatch.

`_startSettling` is internal. A workflow reaches it only through a kind `1` report to `onReport`,
which is ticket 05. This ticket owns the transition and its guards; ticket 05 owns the dispatch and
the forwarder check.

The invariants to test: money out never exceeds money in; no payout unless the Policy Hash and the
Bids Root both match; the buyer cannot withdraw between creation and settlement except through
`timeoutRefund`; Finalized and Timeout are terminal.

One test per row of the "Every USDC in and out" table in `docs/spec.md`. Nine hundred USDC enters
escrow in the demo, a 750 Payout Cap and three 50 Stakes. Each of the five terminal paths returns
exactly that. Asserting the invariant as a sentence is not the same as asserting it as five numbers.

`pendingSettlement` is ticket 20, not this one, but the storage this ticket chooses decides whether
they are cheap. `commitmentsOf` needs the commitments as an array, so a mapping alone is not enough.

Blocked on the USDC decimals, because every figure in the tests depends on them.

## Acceptance criteria

- [x] Each of the five rows of "Every USDC in and out" is one test asserting exact balances for
      buyer, winner, losers and the contract, and the contract balance is zero at the end of each.
- [x] `commit` is once per address, before `bidDeadline`, and pulls `STAKE`.
- [x] The first commit moves `Created → Bidding` with no extra transaction.
- [x] `_startSettling` is rejected outside `Bidding` and before `bidDeadline`. The non-forwarder
      caller is ticket 05's test, because the forwarder check lives on `onReport`.
- [x] `Finalized` and `Timeout` reject every further state-changing call.
- [x] `timeoutRefund` before `finalizeDeadline` reverts.
- [x] The deadlines are contract constants, so no caller can order them wrong. Two auctions with
      identical terms in one block revert instead.
- [x] Commitments are stored per auction as an array, so `commitmentsOf` in ticket 20 is one read.

## Comments

Built across four pull requests, so that each stays near the 400 changed lines the repository asks
for: creation and escrow, `commit`, claim and settlement, then delivery.

Two things the ticket did not decide, decided here:

- `timeoutRefund` accepts `Created`. Row five of "Every USDC in and out" is an auction nobody
  committed to, so it never leaves `Created`, and its Payout Cap is stuck forever without this.
  `docs/spec.md` said `Bidding` or `Settling` and is corrected.
- A settlement with a named winner and a zero Payout is rejected. The Payout is the winning Bid's
  price, and a winner paid nothing would have its Stake held against a delivery nobody bought.

The Solidity Bids Root asserts against a literal computed off chain with viem. That is not the
cross-language parity test, which stays with ticket 19.

## Review

Changed after review of the pull request:

- Budget is the Payout Cap, in the contract and in `CONTEXT.md`. The old name reads as the price the
  buyer will pay, and that price is private.
- The deadlines are contract constants offset from `block.timestamp`: `BID_PERIOD` 2 hours,
  `FINALIZE_PERIOD` 4 hours, `RECEIPT_PERIOD` 6 hours. `createAuction` takes none of them.
  `deliverDeadline` is `receiptDeadline`, after the call that meets it.
- `auctionId` is `keccak256(abi.encode(auction))`, not a counter. The identifier commits to the
  buyer, the Policy Hash, the Payout Cap and the deadlines. Identical terms in one block revert with
  `AuctionAlreadyExists`. Cost: a hashed identifier cannot be enumerated, so `pendingSettlement` in
  ticket 20 needs a list of open auctions.
- The enclave public key is a constructor argument. One key per deployment, not one per auction.
- `AuctionCreated` carries the identifier, the buyer and the deadlines. The Public Requirements and
  the Payout Cap move to `TermsPublished`. The Policy Hash leaves the logs; the identifier commits
  to it.
- The Receipt is no longer stored. `ReceiptPosted` carries it, because no on-chain rule reads it.
- `IERC20`, `SafeERC20` and `ERC20` come from `@openzeppelin/contracts`. `SafeERC20` replaces the
  hand-written bool check, which a token returning nothing would have broken.
- The buyer is not an immutable. Any address may open an auction and is the buyer of that auction.
- `viaIR` is off in both solc profiles. `createAuction` takes three arguments now, and the legacy
  pipeline has stack slots to spare.
- `onReport` arrived early from ticket 05, with the forwarder check, so the tests reach the claim
  and the settlement through the real entry. `supportsInterface` and the receiver template stay with
  ticket 05. The harness and the fixture are deleted.
- One test file, `onchain/test/SealedAuction.t.sol`, with `setUp` inside it. The happy path runs
  first, then one group per function in declaration order.
- The conventions this review produced are in `.claude/rules/solidity.md`.

Second round:

- `STAKE` is `SUPPLIER_STAKE`. `WrongState` is `BadState`. The report `kind` is an `action`, and
  `UnknownReportKind` is `UnknownReportAction`.
- `MAX_BIDS` caps an auction at 5 commitments. Settlement and every refund walk the array, so an
  unbounded array is an auction nobody can finalize.
- `commitments`, `committers` and `hasCommitted` are public, because the relay and the workflow read
  them. `commitmentsOf` stays: the generated getter reads one element and reports no length.
- The bids root drops the sort. The array carries the arrival order and both sides hash it as it
  stands.
- `onlyForwarder` is a modifier.
- `timeoutRefund` rejects the terminal states instead of listing the live ones. `State.None` is
  rejected with them, so an unknown auction fails with `BadState` rather than an ERC-20 error.
- The settlement keeps `policyHash` and `bidsRoot`. Both are the enclave's claim about what it
  scored, and the contract rejects the settlement when either disagrees with what it already holds.
- `onchain/test/README.md` is deleted.

51 Solidity tests pass.
