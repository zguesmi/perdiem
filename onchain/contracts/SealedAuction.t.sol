// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {Test} from "forge-std/Test.sol";

import {SealedAuction} from "./SealedAuction.sol";

/// The first invariant taken straight from the specification: an auction whose deadlines are not
/// strictly increasing must not exist, because it would be either undeliverable or unslashable.
///
/// Both tests are red until `createAuction` is implemented.
contract SealedAuctionTest is Test {
    SealedAuction internal auction;

    uint256 internal constant BUDGET = 750e6;

    function setUp() public {
        auction = new SealedAuction();
    }

    function test_createAuction_acceptsIncreasingDeadlines() public {
        uint64 bidDeadline = uint64(block.timestamp + 10 minutes);
        uint64 finalizeDeadline = bidDeadline + 3 minutes;
        uint64 deliverDeadline = finalizeDeadline + 1 hours;

        bytes32 auctionId = auction.createAuction(bidDeadline, finalizeDeadline, deliverDeadline, BUDGET);

        assertTrue(auctionId != bytes32(0), "an auction that was created must have an id");
    }

    function test_createAuction_rejectsDeadlinesOutOfOrder() public {
        uint64 bidDeadline = uint64(block.timestamp + 10 minutes);
        uint64 finalizeDeadline = bidDeadline - 1 minutes;
        uint64 deliverDeadline = bidDeadline + 1 hours;

        vm.expectRevert(SealedAuction.DeadlinesOutOfOrder.selector);
        auction.createAuction(bidDeadline, finalizeDeadline, deliverDeadline, BUDGET);
    }
}
