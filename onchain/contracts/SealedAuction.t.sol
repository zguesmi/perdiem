// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {SealedAuction} from "./SealedAuction.sol";
import {SealedAuctionFixture} from "./test/SealedAuctionFixture.sol";

/// Opening an auction and committing a Bid: the `Created` and `Bidding` half of the state machine.
contract SealedAuctionCreationTest is SealedAuctionFixture {
    function test_createAuction_acceptsIncreasingDeadlines() public {
        bytes32 auctionId = createDemoAuction();

        assertTrue(auctionId != bytes32(0), "an auction that was created must have an id");
        assertEq(uint8(auction.exposedAuction(auctionId).state), uint8(SealedAuction.State.Created));
    }

    function test_createAuction_rejectsDeadlinesOutOfOrder() public {
        vm.prank(BUYER);
        vm.expectRevert(SealedAuction.DeadlinesOutOfOrder.selector);
        auction.createAuction(
            POLICY_HASH,
            demoRequirements(),
            ENCLAVE_PUBLIC_KEY,
            bidDeadline(),
            bidDeadline() - 1,
            deliverDeadline(),
            BUDGET
        );
    }

    function test_createAuction_rejectsEqualDeadlines() public {
        vm.prank(BUYER);
        vm.expectRevert(SealedAuction.DeadlinesOutOfOrder.selector);
        auction.createAuction(
            POLICY_HASH,
            demoRequirements(),
            ENCLAVE_PUBLIC_KEY,
            bidDeadline(),
            finalizeDeadline(),
            finalizeDeadline(),
            BUDGET
        );
    }

    function test_createAuction_rejectsABidDeadlineInThePast() public {
        vm.prank(BUYER);
        vm.expectRevert(SealedAuction.DeadlinesOutOfOrder.selector);
        auction.createAuction(
            POLICY_HASH,
            demoRequirements(),
            ENCLAVE_PUBLIC_KEY,
            uint64(block.timestamp),
            finalizeDeadline(),
            deliverDeadline(),
            BUDGET
        );
    }

    function test_createAuction_rejectsAnyoneButTheBuyer() public {
        usdc.mint(STRANGER, BUDGET);
        vm.startPrank(STRANGER);
        usdc.approve(address(auction), type(uint256).max);
        vm.expectRevert(SealedAuction.NotBuyer.selector);
        auction.createAuction(
            POLICY_HASH,
            demoRequirements(),
            ENCLAVE_PUBLIC_KEY,
            bidDeadline(),
            finalizeDeadline(),
            deliverDeadline(),
            BUDGET
        );
        vm.stopPrank();
    }

    function test_createAuction_pullsTheBudget() public {
        bytes32 auctionId = createDemoAuction();

        assertEq(usdc.balanceOf(BUYER), 0, "the buyer's Budget is locked");
        assertEq(usdc.balanceOf(address(auction)), BUDGET, "the escrow holds the Budget");
        assertEq(auction.exposedAuction(auctionId).budget, BUDGET);
    }

    function test_createAuction_recordsTheTermsAndTheDeadlines() public {
        uint64 bid = bidDeadline();
        uint64 finalize = finalizeDeadline();
        uint64 deliver = deliverDeadline();

        bytes32 auctionId = createDemoAuction();
        SealedAuction.Auction memory opened = auction.exposedAuction(auctionId);

        assertEq(opened.buyer, BUYER);
        assertEq(opened.policyHash, POLICY_HASH);
        assertEq(opened.enclavePublicKey, ENCLAVE_PUBLIC_KEY);
        assertEq(opened.bidDeadline, bid);
        assertEq(opened.finalizeDeadline, finalize);
        assertEq(opened.deliverDeadline, deliver);
        assertEq(opened.createdBlock, uint64(block.number));
    }

    /// Suppliers read `auctionId` from `AuctionCreated` and never derive it, so the first one has to
    /// be `0x00…01` and the next one has to differ.
    function test_createAuction_numbersAuctionsFromOne() public {
        usdc.mint(BUYER, BUDGET);

        assertEq(createDemoAuction(), bytes32(uint256(1)));
        assertEq(createDemoAuction(), bytes32(uint256(2)));
    }

    function test_commit_movesCreatedToBiddingWithNoExtraTransaction() public {
        bytes32 auctionId = createDemoAuction();

        vm.prank(SUPPLIER_A);
        auction.commit(auctionId, keccak256("A"));

        assertEq(uint8(auction.exposedAuction(auctionId).state), uint8(SealedAuction.State.Bidding));
    }

    function test_commit_pullsTheStake() public {
        bytes32 auctionId = createDemoAuction();

        vm.prank(SUPPLIER_A);
        auction.commit(auctionId, keccak256("A"));

        assertEq(usdc.balanceOf(SUPPLIER_A), SUPPLIER_FUNDING - STAKE);
        assertEq(usdc.balanceOf(address(auction)), BUDGET + STAKE);
    }

    /// `commitmentsOf` in ticket 20 has to be one read, so the commitments are an array per auction,
    /// in arrival order.
    function test_commit_storesCommitmentsAsAnArrayInArrivalOrder() public {
        bytes32 auctionId = createDemoAuction();

        vm.prank(SUPPLIER_C);
        auction.commit(auctionId, keccak256("C"));
        vm.prank(SUPPLIER_A);
        auction.commit(auctionId, keccak256("A"));

        bytes32[] memory commitments = auction.exposedCommitments(auctionId);
        assertEq(commitments.length, 2);
        assertEq(commitments[0], keccak256("C"));
        assertEq(commitments[1], keccak256("A"));
    }

    function test_commit_rejectsASecondCommitFromTheSameAddress() public {
        bytes32 auctionId = createDemoAuction();

        vm.startPrank(SUPPLIER_A);
        auction.commit(auctionId, keccak256("A"));
        vm.expectRevert(SealedAuction.AlreadyCommitted.selector);
        auction.commit(auctionId, keccak256("A again"));
        vm.stopPrank();
    }

    function test_commit_rejectsACommitOnOrAfterTheBidDeadline() public {
        bytes32 auctionId = createDemoAuction();
        vm.warp(auction.exposedAuction(auctionId).bidDeadline);

        vm.prank(SUPPLIER_A);
        vm.expectRevert(SealedAuction.BiddingClosed.selector);
        auction.commit(auctionId, keccak256("A"));
    }

    function test_commit_rejectsAnUnknownAuction() public {
        vm.prank(SUPPLIER_A);
        vm.expectRevert(SealedAuction.WrongState.selector);
        auction.commit(bytes32(uint256(99)), keccak256("A"));
    }
}
