// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {SealedAuction} from "./SealedAuction.sol";
import {SealedAuctionFixture} from "./test/SealedAuctionFixture.sol";

/// What happens to the winner's Stake after `Finalized`: released against a Receipt, or paid to the
/// buyer on silence. Delivery is not a state, so both paths run from `Finalized`.
contract SealedAuctionDeliveryTest is SealedAuctionFixture {
    bytes32 internal constant RECEIPT_HASH = keccak256("the LiteAPI booking id");

    /// Row one of "Every USDC in and out": 440 to the winner, 310 to the buyer, the two losing
    /// Stakes refunded, and the winner's Stake released by the Receipt.
    function test_everyUsdcInAndOut_winnerPostsAReceipt() public {
        bytes32 auctionId = finalizedAuction();

        vm.prank(SUPPLIER_C);
        auction.submitReceipt(auctionId, RECEIPT_HASH);

        assertEq(usdc.balanceOf(SUPPLIER_C), SUPPLIER_FUNDING + PAYOUT, "the winner is paid and its Stake is back");
        assertEq(usdc.balanceOf(BUYER), BUDGET - PAYOUT);
        assertEq(usdc.balanceOf(SUPPLIER_A), SUPPLIER_FUNDING);
        assertEq(usdc.balanceOf(SUPPLIER_B), SUPPLIER_FUNDING);
        assertEq(usdc.balanceOf(address(auction)), 0, "the escrow is empty");

        SealedAuction.Auction memory delivered = auction.exposedAuction(auctionId);
        assertEq(delivered.receiptHash, RECEIPT_HASH);
        assertTrue(delivered.stakeReleased);
        assertFalse(delivered.stakeSlashed);
    }

    /// Row two: the winner never delivers, so its Stake goes to the buyer.
    function test_everyUsdcInAndOut_winnerIsSilentAndSlashed() public {
        bytes32 auctionId = finalizedAuction();
        vm.warp(auction.exposedAuction(auctionId).deliverDeadline);

        vm.prank(STRANGER);
        auction.slash(auctionId);

        assertEq(usdc.balanceOf(SUPPLIER_C), SUPPLIER_FUNDING - STAKE + PAYOUT, "the winner loses its Stake");
        assertEq(usdc.balanceOf(BUYER), BUDGET - PAYOUT + STAKE, "the buyer gets the Stake");
        assertEq(usdc.balanceOf(SUPPLIER_A), SUPPLIER_FUNDING);
        assertEq(usdc.balanceOf(SUPPLIER_B), SUPPLIER_FUNDING);
        assertEq(usdc.balanceOf(address(auction)), 0, "the escrow is empty");

        SealedAuction.Auction memory slashed = auction.exposedAuction(auctionId);
        assertTrue(slashed.stakeSlashed);
        assertFalse(slashed.stakeReleased);
    }

    function test_submitReceipt_rejectsAnyoneButTheWinner() public {
        bytes32 auctionId = finalizedAuction();

        vm.prank(SUPPLIER_A);
        vm.expectRevert(SealedAuction.NotWinner.selector);
        auction.submitReceipt(auctionId, RECEIPT_HASH);
    }

    function test_submitReceipt_rejectsAReceiptOnOrAfterTheDeliverDeadline() public {
        bytes32 auctionId = finalizedAuction();
        vm.warp(auction.exposedAuction(auctionId).deliverDeadline);

        vm.prank(SUPPLIER_C);
        vm.expectRevert(SealedAuction.DeliveryClosed.selector);
        auction.submitReceipt(auctionId, RECEIPT_HASH);
    }

    function test_submitReceipt_rejectsASecondReceipt() public {
        bytes32 auctionId = finalizedAuction();

        vm.startPrank(SUPPLIER_C);
        auction.submitReceipt(auctionId, RECEIPT_HASH);
        vm.expectRevert(SealedAuction.StakeAlreadySettled.selector);
        auction.submitReceipt(auctionId, keccak256("another booking"));
        vm.stopPrank();
    }

    function test_submitReceipt_rejectsAReceiptBeforeTheAuctionIsFinalized() public {
        bytes32 auctionId = claimedAuction();

        vm.prank(SUPPLIER_C);
        vm.expectRevert(SealedAuction.WrongState.selector);
        auction.submitReceipt(auctionId, RECEIPT_HASH);
    }

    function test_slash_rejectsASlashBeforeTheDeliverDeadline() public {
        bytes32 auctionId = finalizedAuction();

        vm.expectRevert(SealedAuction.TooEarly.selector);
        auction.slash(auctionId);
    }

    function test_slash_rejectsASlashAfterAReceipt() public {
        bytes32 auctionId = finalizedAuction();
        vm.prank(SUPPLIER_C);
        auction.submitReceipt(auctionId, RECEIPT_HASH);
        vm.warp(auction.exposedAuction(auctionId).deliverDeadline);

        vm.expectRevert(SealedAuction.StakeAlreadySettled.selector);
        auction.slash(auctionId);
    }

    function test_slash_rejectsASecondSlash() public {
        bytes32 auctionId = finalizedAuction();
        vm.warp(auction.exposedAuction(auctionId).deliverDeadline);
        auction.slash(auctionId);

        vm.expectRevert(SealedAuction.StakeAlreadySettled.selector);
        auction.slash(auctionId);
    }

    /// `Timeout` is terminal, and delivery is not a way back out of it.
    function test_timeoutRejectsEveryDeliveryCall() public {
        bytes32 auctionId = biddingClosedAuction();
        vm.warp(auction.exposedAuction(auctionId).finalizeDeadline);
        auction.timeoutRefund(auctionId);
        vm.warp(auction.exposedAuction(auctionId).deliverDeadline);

        vm.prank(SUPPLIER_C);
        vm.expectRevert(SealedAuction.WrongState.selector);
        auction.submitReceipt(auctionId, RECEIPT_HASH);

        vm.expectRevert(SealedAuction.WrongState.selector);
        auction.slash(auctionId);
    }

    /// An auction with no winner refunded every Stake at settlement, so there is nothing to slash.
    function test_slash_rejectsAnAuctionWithNoWinner() public {
        bytes32 auctionId = claimedAuction();
        auction.exposedSettle(noWinnerSettlement(auctionId));
        vm.warp(auction.exposedAuction(auctionId).deliverDeadline);

        vm.expectRevert(SealedAuction.NotWinner.selector);
        auction.slash(auctionId);
    }
}
