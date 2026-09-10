// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {SealedAuction} from "./SealedAuction.sol";
import {SealedAuctionFixture} from "./test/SealedAuctionFixture.sol";

/// Claiming an auction, settling it, and refunding it when nothing lands.
///
/// The forwarder check and the `onReport` dispatch that reach `_startSettling` and `_settle` are
/// ticket 05. This file drives both through the harness.
contract SealedAuctionSettlementTest is SealedAuctionFixture {
    function test_bidsRoot_isZeroWithNoCommitments() public {
        bytes32 auctionId = createDemoAuction();

        assertEq(auction.exposedBidsRoot(auctionId), bytes32(0));
    }

    /// The root is over the sorted set, so the order the commitments arrived in cannot change it.
    function test_bidsRoot_sortsAscendingWhateverTheArrivalOrder() public {
        bytes32 ascending = createDemoAuction();
        commitInOrder(ascending, 0, 1, 2);

        usdc.mint(BUYER, BUDGET);
        bytes32 shuffled = createDemoAuction();
        commitInOrder(shuffled, 2, 0, 1);

        assertEq(auction.exposedBidsRoot(ascending), DEMO_BIDS_ROOT);
        assertEq(auction.exposedBidsRoot(shuffled), DEMO_BIDS_ROOT);
    }

    function test_startSettling_movesBiddingToSettling() public {
        bytes32 auctionId = biddingClosedAuction();

        auction.exposedStartSettling(auctionId);

        assertEq(uint8(auction.exposedAuction(auctionId).state), uint8(SealedAuction.State.Settling));
    }

    function test_startSettling_rejectsAClaimBeforeTheBidDeadline() public {
        bytes32 auctionId = createDemoAuction();
        commitInOrder(auctionId, 0, 1, 2);

        vm.expectRevert(SealedAuction.BiddingNotClosed.selector);
        auction.exposedStartSettling(auctionId);
    }

    function test_startSettling_rejectsAnAuctionWithNoCommitments() public {
        bytes32 auctionId = createDemoAuction();
        vm.warp(auction.exposedAuction(auctionId).bidDeadline);

        vm.expectRevert(SealedAuction.WrongState.selector);
        auction.exposedStartSettling(auctionId);
    }

    /// A second claim wastes a write and, in the demo, looks exactly like a bug in the settlement.
    function test_startSettling_rejectsASecondClaim() public {
        bytes32 auctionId = biddingClosedAuction();
        auction.exposedStartSettling(auctionId);

        vm.expectRevert(SealedAuction.WrongState.selector);
        auction.exposedStartSettling(auctionId);
    }

    function test_settle_rejectsASettlementBeforeTheClaim() public {
        bytes32 auctionId = biddingClosedAuction();

        vm.expectRevert(SealedAuction.WrongState.selector);
        auction.exposedSettle(winningSettlement(auctionId));
    }

    function test_settle_rejectsAWrongPolicyHash() public {
        bytes32 auctionId = claimedAuction();
        SealedAuction.Settlement memory settlement = winningSettlement(auctionId);
        settlement.policyHash = keccak256("a different policy");

        vm.expectRevert(SealedAuction.PolicyHashMismatch.selector);
        auction.exposedSettle(settlement);
    }

    function test_settle_rejectsAWrongBidsRoot() public {
        bytes32 auctionId = claimedAuction();
        SealedAuction.Settlement memory settlement = winningSettlement(auctionId);
        settlement.bidsRoot = keccak256("a different set of bids");

        vm.expectRevert(SealedAuction.BidsRootMismatch.selector);
        auction.exposedSettle(settlement);
    }

    function test_settle_rejectsAPayoutAboveTheBudget() public {
        bytes32 auctionId = claimedAuction();
        SealedAuction.Settlement memory settlement = winningSettlement(auctionId);
        settlement.payout = BUDGET + 1;

        vm.expectRevert(SealedAuction.PayoutAboveBudget.selector);
        auction.exposedSettle(settlement);
    }

    function test_settle_rejectsAWinnerThatNeverCommitted() public {
        bytes32 auctionId = claimedAuction();
        SealedAuction.Settlement memory settlement = winningSettlement(auctionId);
        settlement.winner = STRANGER;

        vm.expectRevert(SealedAuction.WinnerNeverCommitted.selector);
        auction.exposedSettle(settlement);
    }

    function test_settle_rejectsAPayoutWithNoWinner() public {
        bytes32 auctionId = claimedAuction();
        SealedAuction.Settlement memory settlement = winningSettlement(auctionId);
        settlement.winner = address(0);

        vm.expectRevert(SealedAuction.PayoutWithoutWinner.selector);
        auction.exposedSettle(settlement);
    }

    function test_settle_rejectsAWinnerWithNoPayout() public {
        bytes32 auctionId = claimedAuction();

        vm.expectRevert(SealedAuction.WinnerWithoutPayout.selector);
        auction.exposedSettle(settlementOf(auctionId, SUPPLIER_C, 0));
    }

    /// The buyer cannot withdraw between creation and settlement. `timeoutRefund` is the only path
    /// out, and it is shut until `finalizeDeadline`.
    function test_theBuyerCannotWithdrawBeforeTheFinalizeDeadline() public {
        bytes32 auctionId = claimedAuction();

        vm.prank(BUYER);
        vm.expectRevert(SealedAuction.TooEarly.selector);
        auction.timeoutRefund(auctionId);

        assertEq(usdc.balanceOf(BUYER), 0, "the Budget is still locked");
        assertEq(usdc.balanceOf(address(auction)), BUDGET + 3 * STAKE, "the escrow still holds everything");
    }

    /// The demo settlement: 440 to the winner, 310 back to the buyer, the two losing Stakes
    /// refunded, and the winner's Stake still held against the Receipt.
    function test_settle_paysTheWinnerAndRefundsTheRest() public {
        bytes32 auctionId = claimedAuction();

        auction.exposedSettle(winningSettlement(auctionId));

        assertEq(usdc.balanceOf(SUPPLIER_C), SUPPLIER_FUNDING - STAKE + PAYOUT, "the winner is paid");
        assertEq(usdc.balanceOf(BUYER), BUDGET - PAYOUT, "the buyer keeps the unspent Budget");
        assertEq(usdc.balanceOf(SUPPLIER_A), SUPPLIER_FUNDING, "a losing Stake is refunded");
        assertEq(usdc.balanceOf(SUPPLIER_B), SUPPLIER_FUNDING, "a losing Stake is refunded");
        assertEq(usdc.balanceOf(address(auction)), STAKE, "the escrow holds the winner's Stake");
        assertEq(uint8(auction.exposedAuction(auctionId).state), uint8(SealedAuction.State.Finalized));
    }

    /// Row three of "Every USDC in and out": 750 back to the buyer and 150 in Stakes.
    function test_everyUsdcInAndOut_noEligibleBid() public {
        bytes32 auctionId = claimedAuction();

        auction.exposedSettle(noWinnerSettlement(auctionId));

        assertEverythingReturned(auctionId);
        assertEq(uint8(auction.exposedAuction(auctionId).state), uint8(SealedAuction.State.Finalized));
    }

    /// Row four, from `Bidding`: the workflow never claimed the auction.
    function test_everyUsdcInAndOut_timeoutFromBidding() public {
        bytes32 auctionId = biddingClosedAuction();
        vm.warp(auction.exposedAuction(auctionId).finalizeDeadline);

        auction.timeoutRefund(auctionId);

        assertEverythingReturned(auctionId);
        assertEq(uint8(auction.exposedAuction(auctionId).state), uint8(SealedAuction.State.Timeout));
    }

    /// Row four, from `Settling`: the workflow claimed the auction and its settlement never landed.
    function test_everyUsdcInAndOut_timeoutFromSettling() public {
        bytes32 auctionId = claimedAuction();
        vm.warp(auction.exposedAuction(auctionId).finalizeDeadline);

        auction.timeoutRefund(auctionId);

        assertEverythingReturned(auctionId);
    }

    /// Row five: nobody committed, so only the Budget ever entered the escrow.
    function test_everyUsdcInAndOut_timeoutWithNoCommitAtAll() public {
        bytes32 auctionId = createDemoAuction();
        vm.warp(auction.exposedAuction(auctionId).finalizeDeadline);

        auction.timeoutRefund(auctionId);

        assertEverythingReturned(auctionId);
    }

    /// Without this a losing bidder refunds the auction a second after `bidDeadline`, before the
    /// Enclave has run.
    function test_timeoutRefund_rejectsARefundBeforeTheFinalizeDeadline() public {
        bytes32 auctionId = biddingClosedAuction();

        vm.expectRevert(SealedAuction.TooEarly.selector);
        auction.timeoutRefund(auctionId);
    }

    function test_finalizedIsTerminal() public {
        bytes32 auctionId = claimedAuction();
        auction.exposedSettle(winningSettlement(auctionId));

        assertTerminal(auctionId);
    }

    function test_timeoutIsTerminal() public {
        bytes32 auctionId = biddingClosedAuction();
        vm.warp(auction.exposedAuction(auctionId).finalizeDeadline);
        auction.timeoutRefund(auctionId);

        assertTerminal(auctionId);
    }

    /// Every supplier whole, the buyer whole, and nothing left in the escrow.
    function assertEverythingReturned(bytes32 auctionId) internal view {
        assertEq(usdc.balanceOf(BUYER), BUDGET, "the buyer gets the Budget back");
        assertEq(usdc.balanceOf(SUPPLIER_A), SUPPLIER_FUNDING, "a Stake is refunded");
        assertEq(usdc.balanceOf(SUPPLIER_B), SUPPLIER_FUNDING, "a Stake is refunded");
        assertEq(usdc.balanceOf(SUPPLIER_C), SUPPLIER_FUNDING, "a Stake is refunded");
        assertEq(usdc.balanceOf(address(auction)), 0, "the escrow is empty");
        assertEq(auction.exposedAuction(auctionId).winner, address(0));
    }

    function assertTerminal(bytes32 auctionId) internal {
        vm.prank(SUPPLIER_A);
        vm.expectRevert(SealedAuction.WrongState.selector);
        auction.commit(auctionId, keccak256("late"));

        vm.expectRevert(SealedAuction.WrongState.selector);
        auction.exposedStartSettling(auctionId);

        vm.expectRevert(SealedAuction.WrongState.selector);
        auction.exposedSettle(winningSettlement(auctionId));

        vm.warp(auction.exposedAuction(auctionId).finalizeDeadline);
        vm.expectRevert(SealedAuction.WrongState.selector);
        auction.timeoutRefund(auctionId);
    }
}
