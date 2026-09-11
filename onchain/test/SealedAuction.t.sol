// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {Test} from "forge-std/Test.sol";

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import {IReceiver} from "../contracts/IReceiver.sol";
import {SealedAuction} from "../contracts/SealedAuction.sol";
import {MockUSDC} from "../contracts/mocks/MockUSDC.sol";

/**
 * The whole `SealedAuction` state machine: escrow, the auction lifecycle and the settlement the
 * forwarder delivers.
 *
 * The lifecycle runs first. Every later group covers one function, in the order the functions are
 * declared in the contract, and each group opens with the case that succeeds.
 */
contract SealedAuctionTest is Test {
    MockUSDC internal usdc;
    SealedAuction internal auction;

    address internal constant SUPPLIER_A = address(0xA1);
    address internal constant SUPPLIER_B = address(0xA2);
    address internal constant SUPPLIER_C = address(0xA3);
    address internal constant BUYER = address(0xB0);
    address internal constant FORWARDER = address(0xF0);
    address internal constant STRANGER = address(0x5E);

    uint256 internal constant PAYOUT_CAP = 750e6;
    uint256 internal constant SUPPLIER_STAKE = 50e6;
    uint256 internal constant PAYOUT = 440e6;
    uint256 internal constant MAX_BIDS = 5;
    uint256 internal constant MAX_OPEN_AUCTIONS = 32;

    /// @dev Ample: each supplier commits at most once per auction across the whole suite.
    uint256 internal constant SUPPLIER_FUNDING = 500e6;

    uint64 internal constant BID_PERIOD = 2 hours;
    uint64 internal constant FINALIZE_PERIOD = 4 hours;

    uint8 internal constant ACTION_CLAIM = 1;
    uint8 internal constant ACTION_SETTLE = 2;

    bytes32 internal constant POLICY_HASH = keccak256("the policy");
    bytes32 internal constant ENCLAVE_PUBLIC_KEY = keccak256("the enclave x25519 public key");
    string internal constant BOOKING_ID = "lp-booking-1";

    /**
     * The three commitments below in arrival order, hashed with `abi.encodePacked`. Computed off
     * chain with viem, so a mistake in the Solidity encoding cannot agree with itself.
     */
    bytes32 internal constant BIDS_ROOT = 0xffdbd9c1b65b61303d9298cfb6afcb3114a6ec8400b2280b102f32a581913b7f;

    /// The same three commitments in the order C, A, B.
    bytes32 internal constant SHUFFLED_BIDS_ROOT = 0x4bab02b90a0348eb8ab4956b0e013ef1c3d7a4d77ad3c9253857dd8d0e561d1f;

    /// The auction the pinned reports below were encoded against. Any value: nothing derives it.
    bytes32 internal constant FIXTURE_AUCTION_ID = keccak256("the auction");

    /**
     * The three report bodies the enclave's encoder produced, pinned identically in
     * `shared/report.test.ts`. A member reordered on one side fails one of the two suites; a body
     * the tests build themselves agrees with whatever the tests do.
     */
    bytes internal constant CLAIM_REPORT =
        hex"0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000204a6f6558ddbe534c870896c026435a848d633bcddadbb5ffdc7c84ba111a3827";

    bytes internal constant SETTLEMENT_REPORT =
        hex"00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000012000000000000000000000000000000000000000000000000000000000000000204a6f6558ddbe534c870896c026435a848d633bcddadbb5ffdc7c84ba111a382700000000000000000000000000000000000000000000000000000000000000a3000000000000000000000000000000000000000000000000000000001a39de003d6505bc416908666b6dde75e609ac6fa0f6231177936c6027c9f5320a390993ffdbd9c1b65b61303d9298cfb6afcb3114a6ec8400b2280b102f32a581913b7f00000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000000c6c702d626f6f6b696e672d310000000000000000000000000000000000000000";

    bytes internal constant NO_WINNER_REPORT =
        hex"00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000204a6f6558ddbe534c870896c026435a848d633bcddadbb5ffdc7c84ba111a3827000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003d6505bc416908666b6dde75e609ac6fa0f6231177936c6027c9f5320a390993ffdbd9c1b65b61303d9298cfb6afcb3114a6ec8400b2280b102f32a581913b7f00000000000000000000000000000000000000000000000000000000000000c00000000000000000000000000000000000000000000000000000000000000000";

    /// The moment the auction under test was opened. Every deadline is an offset from it.
    uint64 internal openedAt;

    function setUp() public {
        usdc = new MockUSDC();
        auction = new SealedAuction(usdc, FORWARDER, ENCLAVE_PUBLIC_KEY);

        usdc.mint(BUYER, PAYOUT_CAP);
        vm.prank(BUYER);
        usdc.approve(address(auction), type(uint256).max);

        for (uint256 i = 0; i < 6; i++) {
            usdc.mint(supplier(i), SUPPLIER_FUNDING);
            vm.prank(supplier(i));
            usdc.approve(address(auction), type(uint256).max);
        }
    }

    /**
     * One auction from end to end: the buyer locks the cap, three suppliers commit, and the
     * forwarder claims and settles. 750 plus three stakes go in; 440 to the winner, 310 to the
     * buyer and every stake back come out.
     */
    function test_auctionLifecycle_paysTheWinnerAndRefundsEveryStake() public {
        bytes32 auctionId = openAuction();
        assertEq(usdc.balanceOf(address(auction)), PAYOUT_CAP, "the escrow holds the cap");

        commitInOrder(auctionId, 0, 1, 2);
        assertEq(uint8(stateOf(auctionId)), uint8(SealedAuction.State.Bidding));
        assertEq(usdc.balanceOf(address(auction)), PAYOUT_CAP + 3 * SUPPLIER_STAKE, "the escrow holds three stakes");

        vm.warp(openedAt + BID_PERIOD);
        claim(auctionId);
        assertEq(uint8(stateOf(auctionId)), uint8(SealedAuction.State.Settling));

        settle(winningSettlement(auctionId));
        assertEq(uint8(stateOf(auctionId)), uint8(SealedAuction.State.Finalized));

        assertEq(usdc.balanceOf(SUPPLIER_C), SUPPLIER_FUNDING + PAYOUT, "the winner is paid and its stake is back");
        assertEq(usdc.balanceOf(BUYER), PAYOUT_CAP - PAYOUT, "the buyer keeps what the winner did not ask for");
        assertEq(usdc.balanceOf(SUPPLIER_A), SUPPLIER_FUNDING, "a losing stake is refunded");
        assertEq(usdc.balanceOf(SUPPLIER_B), SUPPLIER_FUNDING, "a losing stake is refunded");
        assertEq(usdc.balanceOf(address(auction)), 0, "the escrow is empty");
    }

    function test_createAuction_recordsTheTerms() public {
        bytes32 auctionId = openAuction();
        (SealedAuction.State state, address buyer,,,, bytes32 policyHash, uint256 payoutCap,,) =
            auction.auctions(auctionId);

        assertEq(uint8(state), uint8(SealedAuction.State.Created));
        assertEq(buyer, BUYER);
        assertEq(policyHash, POLICY_HASH);
        assertEq(payoutCap, PAYOUT_CAP);
    }

    function test_createAuction_pullsThePayoutCap() public {
        openAuction();

        assertEq(usdc.balanceOf(BUYER), 0, "the buyer's USDC is locked");
        assertEq(usdc.balanceOf(address(auction)), PAYOUT_CAP, "the escrow holds it");
    }

    /// The buyer passes no deadline, so no auction can exist that is undeliverable.
    function test_createAuction_derivesTheDeadlinesFromTheBlockTimestamp() public {
        bytes32 auctionId = openAuction();
        (,, uint64 createdAt, uint64 bidDeadline, uint64 finalizeDeadline,,,,) = auction.auctions(auctionId);

        assertEq(createdAt, uint64(block.timestamp));
        assertEq(bidDeadline, createdAt + BID_PERIOD);
        assertEq(finalizeDeadline, createdAt + FINALIZE_PERIOD);
        assertEq(auction.BID_PERIOD(), BID_PERIOD);
        assertEq(auction.FINALIZE_PERIOD(), FINALIZE_PERIOD);
    }

    /// The identifier is the hash of the record, so one different term is one different auction.
    function test_createAuction_bindsTheTermsIntoTheAuctionId() public {
        bytes32 first = openAuction();

        usdc.mint(BUYER, PAYOUT_CAP);
        bytes32 second = openAuctionWith(keccak256("a different policy"));

        assertTrue(first != bytes32(0), "an auction that was opened has an id");
        assertTrue(first != second, "a different policy hash is a different auction");
    }

    /// Identical terms in the same block would hash to one identifier and overwrite each other.
    function test_createAuction_rejectsADuplicateInTheSameBlock() public {
        openAuction();
        usdc.mint(BUYER, PAYOUT_CAP);

        vm.prank(BUYER);
        vm.expectRevert(SealedAuction.AuctionAlreadyExists.selector);
        auction.createAuction(POLICY_HASH, requirements(), PAYOUT_CAP);
    }

    /// `pendingSettlement` walks the open auctions, so the list has a ceiling and this enforces it.
    function test_createAuction_rejectsMoreOpenAuctionsThanTheScanWalks() public {
        fundExtraAuctions(MAX_OPEN_AUCTIONS);
        for (uint256 i = 0; i < MAX_OPEN_AUCTIONS; i++) {
            openAuctionWith(POLICY_HASH, PAYOUT_CAP - i);
        }

        vm.expectRevert(SealedAuction.OpenAuctionLimitReached.selector);
        openAuctionWith(POLICY_HASH, PAYOUT_CAP - MAX_OPEN_AUCTIONS);
    }

    function test_commit_movesCreatedToBiddingWithNoExtraTransaction() public {
        bytes32 auctionId = openAuction();

        vm.prank(SUPPLIER_A);
        auction.commit(auctionId, placedBy(0));

        assertEq(uint8(stateOf(auctionId)), uint8(SealedAuction.State.Bidding));
        assertTrue(auction.hasCommitted(auctionId, SUPPLIER_A));
    }

    function test_commit_pullsTheStake() public {
        bytes32 auctionId = openAuction();

        vm.prank(SUPPLIER_A);
        auction.commit(auctionId, placedBy(0));

        assertEq(usdc.balanceOf(SUPPLIER_A), SUPPLIER_FUNDING - SUPPLIER_STAKE);
        assertEq(usdc.balanceOf(address(auction)), PAYOUT_CAP + SUPPLIER_STAKE);
        assertEq(auction.SUPPLIER_STAKE(), SUPPLIER_STAKE);
    }

    function test_commit_storesCommitmentsAndCommittersInArrivalOrder() public {
        bytes32 auctionId = openAuction();

        vm.prank(SUPPLIER_C);
        auction.commit(auctionId, placedBy(2));
        vm.prank(SUPPLIER_A);
        auction.commit(auctionId, placedBy(0));

        assertEq(auction.commitments(auctionId)[0], placedBy(2));
        assertEq(auction.commitments(auctionId)[1], placedBy(0));
        assertEq(auction.committers(auctionId)[0], SUPPLIER_C);
        assertEq(auction.committers(auctionId)[1], SUPPLIER_A);
    }

    function test_commit_rejectsASecondCommitFromTheSameAddress() public {
        bytes32 auctionId = openAuction();

        vm.startPrank(SUPPLIER_A);
        auction.commit(auctionId, placedBy(0));
        vm.expectRevert(SealedAuction.AlreadyCommitted.selector);
        auction.commit(auctionId, keccak256("A again"));
        vm.stopPrank();
    }

    /// Settlement and every refund walk the commitments, so an unbounded array is a stuck auction.
    function test_commit_rejectsMoreThanMaxBids() public {
        bytes32 auctionId = openAuction();
        for (uint256 i = 0; i < MAX_BIDS; i++) {
            vm.prank(supplier(i));
            auction.commit(auctionId, keccak256(abi.encode(i)));
        }

        vm.prank(supplier(MAX_BIDS));
        vm.expectRevert(SealedAuction.BidLimitReached.selector);
        auction.commit(auctionId, keccak256("one too many"));

        assertEq(auction.MAX_BIDS(), MAX_BIDS);
    }

    function test_commit_rejectsACommitOnOrAfterTheBidDeadline() public {
        bytes32 auctionId = openAuction();
        vm.warp(openedAt + BID_PERIOD);

        vm.prank(SUPPLIER_A);
        vm.expectRevert(SealedAuction.BiddingClosed.selector);
        auction.commit(auctionId, placedBy(0));
    }

    function test_commit_rejectsAnUnknownAuction() public {
        vm.prank(SUPPLIER_A);
        vm.expectRevert(SealedAuction.BadState.selector);
        auction.commit(keccak256("no such auction"), placedBy(0));
    }

    function test_onReport_claimMovesBiddingToSettling() public {
        bytes32 auctionId = biddingClosedAuction();

        claim(auctionId);

        assertEq(uint8(stateOf(auctionId)), uint8(SealedAuction.State.Settling));
    }

    /// 440 to the winner, 310 back to the buyer, the losing stakes refunded, the winner's held.
    function test_onReport_settlementPaysTheWinnerAndRefundsTheRest() public {
        bytes32 auctionId = claimedAuction();

        settle(winningSettlement(auctionId));

        assertEq(usdc.balanceOf(SUPPLIER_C), SUPPLIER_FUNDING + PAYOUT, "the winner is paid and its stake is back");
        assertEq(usdc.balanceOf(BUYER), PAYOUT_CAP - PAYOUT, "the buyer keeps the rest");
        assertEq(usdc.balanceOf(SUPPLIER_A), SUPPLIER_FUNDING, "a losing stake is refunded");
        assertEq(usdc.balanceOf(SUPPLIER_B), SUPPLIER_FUNDING, "a losing stake is refunded");
        assertEq(usdc.balanceOf(address(auction)), 0, "the escrow is empty");
        assertEq(uint8(stateOf(auctionId)), uint8(SealedAuction.State.Finalized));
    }

    /// No eligible bid: the cap and every stake go back.
    function test_onReport_settlementWithNoWinnerRefundsEverything() public {
        bytes32 auctionId = claimedAuction();

        settle(noWinnerSettlement(auctionId));

        assertEverythingReturned(auctionId);
        assertEq(uint8(stateOf(auctionId)), uint8(SealedAuction.State.Finalized));
    }

    function test_onReport_rejectsAReportFromAnyoneButTheForwarder() public {
        bytes32 auctionId = biddingClosedAuction();

        vm.prank(STRANGER);
        vm.expectRevert(SealedAuction.NotForwarder.selector);
        auction.onReport("", abi.encode(ACTION_CLAIM, abi.encode(auctionId)));
    }

    function test_onReport_rejectsAnUnknownAction() public {
        bytes32 auctionId = biddingClosedAuction();

        vm.prank(FORWARDER);
        vm.expectRevert(SealedAuction.UnknownReportAction.selector);
        auction.onReport("", abi.encode(uint8(3), abi.encode(auctionId)));
    }

    function test_onReport_rejectsAClaimBeforeTheBidDeadline() public {
        bytes32 auctionId = openAuction();
        commitInOrder(auctionId, 0, 1, 2);

        vm.expectRevert(SealedAuction.BiddingNotClosed.selector);
        claim(auctionId);
    }

    function test_onReport_rejectsAClaimOnAnAuctionWithNoCommitments() public {
        bytes32 auctionId = openAuction();
        vm.warp(openedAt + BID_PERIOD);

        vm.expectRevert(SealedAuction.BadState.selector);
        claim(auctionId);
    }

    /// A second claim wastes a write and reads exactly like a bug in the settlement.
    function test_onReport_rejectsASecondClaim() public {
        bytes32 auctionId = claimedAuction();

        vm.expectRevert(SealedAuction.BadState.selector);
        claim(auctionId);
    }

    function test_onReport_rejectsASettlementBeforeTheClaim() public {
        bytes32 auctionId = biddingClosedAuction();

        vm.expectRevert(SealedAuction.BadState.selector);
        settle(winningSettlement(auctionId));
    }

    function test_onReport_rejectsAWrongPolicyHash() public {
        bytes32 auctionId = claimedAuction();
        SealedAuction.Settlement memory settlement = winningSettlement(auctionId);
        settlement.policyHash = keccak256("a different policy");

        vm.expectRevert(SealedAuction.PolicyHashMismatch.selector);
        settle(settlement);
    }

    function test_onReport_rejectsAWrongBidsRoot() public {
        bytes32 auctionId = claimedAuction();
        SealedAuction.Settlement memory settlement = winningSettlement(auctionId);
        settlement.bidsRoot = keccak256("a different set of bids");

        vm.expectRevert(SealedAuction.BidsRootMismatch.selector);
        settle(settlement);
    }

    function test_onReport_rejectsAPayoutAboveTheCap() public {
        bytes32 auctionId = claimedAuction();
        SealedAuction.Settlement memory settlement = winningSettlement(auctionId);
        settlement.payout = PAYOUT_CAP + 1;

        vm.expectRevert(SealedAuction.PayoutAboveCap.selector);
        settle(settlement);
    }

    function test_onReport_rejectsAWinnerThatNeverCommitted() public {
        bytes32 auctionId = claimedAuction();
        SealedAuction.Settlement memory settlement = winningSettlement(auctionId);
        settlement.winner = STRANGER;

        vm.expectRevert(SealedAuction.WinnerNeverCommitted.selector);
        settle(settlement);
    }

    function test_onReport_rejectsAPayoutWithNoWinner() public {
        bytes32 auctionId = claimedAuction();
        SealedAuction.Settlement memory settlement = winningSettlement(auctionId);
        settlement.winner = address(0);

        vm.expectRevert(SealedAuction.PayoutWithoutWinner.selector);
        settle(settlement);
    }

    function test_onReport_rejectsAWinnerWithNoPayout() public {
        bytes32 auctionId = claimedAuction();

        vm.expectRevert(SealedAuction.WinnerWithoutPayout.selector);
        settle(settlementOf(auctionId, SUPPLIER_C, 0));
    }

    /// No booking id, no booking. Paying for one would pay for a stay nobody reserved.
    function test_onReport_rejectsAWinnerWithNoBookingId() public {
        bytes32 auctionId = claimedAuction();
        SealedAuction.Settlement memory settlement = winningSettlement(auctionId);
        settlement.bookingId = "";

        vm.expectRevert(SealedAuction.MissingBookingId.selector);
        settle(settlement);
    }

    function test_onReport_settlementEmitsTheBookingId() public {
        bytes32 auctionId = claimedAuction();

        vm.expectEmit(true, true, false, true, address(auction));
        emit SealedAuction.AuctionFinalized(auctionId, SUPPLIER_C, PAYOUT, BOOKING_ID);
        settle(winningSettlement(auctionId));
    }

    /// Both writes of one run, decoded from the bytes the enclave's encoder actually produced.
    function test_onReport_decodesTheClaimAndTheSettlementTheEnclaveEncoded() public pure {
        (uint8 claimAction, bytes memory claimPayload) = abi.decode(CLAIM_REPORT, (uint8, bytes));
        (uint8 settleAction, bytes memory settlePayload) = abi.decode(SETTLEMENT_REPORT, (uint8, bytes));
        SealedAuction.Settlement memory settlement = abi.decode(settlePayload, (SealedAuction.Settlement));

        assertEq(claimAction, ACTION_CLAIM);
        assertEq(abi.decode(claimPayload, (bytes32)), FIXTURE_AUCTION_ID);
        assertEq(settleAction, ACTION_SETTLE);
        assertEq(settlement.auctionId, FIXTURE_AUCTION_ID);
        assertEq(settlement.winner, SUPPLIER_C);
        assertEq(settlement.payout, PAYOUT);
        assertEq(settlement.policyHash, POLICY_HASH);
        assertEq(settlement.bidsRoot, BIDS_ROOT);
        assertEq(settlement.bookingId, BOOKING_ID);
    }

    /// An empty `bookingId` is the no-winner path, and a dynamic member is where two encoders drift.
    function test_onReport_decodesASettlementWithNoWinner() public pure {
        (, bytes memory payload) = abi.decode(NO_WINNER_REPORT, (uint8, bytes));
        SealedAuction.Settlement memory settlement = abi.decode(payload, (SealedAuction.Settlement));

        assertEq(settlement.winner, address(0));
        assertEq(settlement.payout, 0);
        assertEq(settlement.bookingId, "");
    }

    /// The workflow never claimed the auction.
    function test_timeoutRefund_refundsFromBidding() public {
        bytes32 auctionId = biddingClosedAuction();
        vm.warp(openedAt + FINALIZE_PERIOD);

        auction.timeoutRefund(auctionId);

        assertEverythingReturned(auctionId);
        assertEq(uint8(stateOf(auctionId)), uint8(SealedAuction.State.Timeout));
    }

    /// The workflow claimed the auction and its settlement never landed.
    function test_timeoutRefund_refundsFromSettling() public {
        bytes32 auctionId = claimedAuction();
        vm.warp(openedAt + FINALIZE_PERIOD);

        auction.timeoutRefund(auctionId);

        assertEverythingReturned(auctionId);
    }

    /// Nobody committed, so only the cap ever entered the escrow.
    function test_timeoutRefund_refundsFromCreatedWithNoCommitAtAll() public {
        bytes32 auctionId = openAuction();
        vm.warp(openedAt + FINALIZE_PERIOD);

        auction.timeoutRefund(auctionId);

        assertEverythingReturned(auctionId);
    }

    /**
     * Without the wait a losing bidder refunds the auction a second after `bidDeadline`, before the
     * enclave has run. The buyer has no earlier way out either.
     */
    function test_timeoutRefund_rejectsARefundBeforeTheFinalizeDeadline() public {
        bytes32 auctionId = claimedAuction();

        vm.prank(BUYER);
        vm.expectRevert(SealedAuction.TooEarly.selector);
        auction.timeoutRefund(auctionId);

        assertEq(usdc.balanceOf(BUYER), 0, "the cap is still locked");
        assertEq(
            usdc.balanceOf(address(auction)),
            PAYOUT_CAP + 3 * SUPPLIER_STAKE,
            "the escrow still holds everything"
        );
    }

    function test_timeoutRefund_rejectsAnUnknownAuction() public {
        vm.expectRevert(SealedAuction.BadState.selector);
        auction.timeoutRefund(keccak256("no such auction"));
    }

    function test_timeoutRefund_rejectsAFinalizedAuction() public {
        bytes32 auctionId = finalizedAuction();
        vm.warp(openedAt + FINALIZE_PERIOD);

        vm.expectRevert(SealedAuction.BadState.selector);
        auction.timeoutRefund(auctionId);
    }

    function test_timeoutRefund_rejectsASecondRefund() public {
        bytes32 auctionId = biddingClosedAuction();
        vm.warp(openedAt + FINALIZE_PERIOD);
        auction.timeoutRefund(auctionId);

        vm.expectRevert(SealedAuction.BadState.selector);
        auction.timeoutRefund(auctionId);
    }

    /**
     * What the cron reads every minute: an auction past its bid deadline that nobody has claimed.
     */
    function test_pendingSettlement_returnsAnAuctionPastItsBidDeadline() public {
        assertEq(auction.pendingSettlement(), bytes32(0), "no auction is open yet");

        bytes32 auctionId = biddingClosedAuction();

        assertEq(auction.pendingSettlement(), auctionId);
    }

    /// Bidding is still open, so scoring now would drop every bid that has not arrived.
    function test_pendingSettlement_isZeroBeforeTheBidDeadline() public {
        bytes32 auctionId = openAuction();
        commitInOrder(auctionId, 0, 1, 2);
        vm.warp(openedAt + BID_PERIOD - 1);

        assertEq(auction.pendingSettlement(), bytes32(0));
    }

    /// Nobody committed, so the auction is still `Created` and there is nothing to score.
    function test_pendingSettlement_isZeroForAnAuctionNobodyCommittedTo() public {
        openAuction();
        vm.warp(openedAt + BID_PERIOD);

        assertEq(auction.pendingSettlement(), bytes32(0));
    }

    /// A second claim wastes a write and reads, in the logs, exactly like a broken settlement.
    function test_pendingSettlement_isZeroWhileAnAuctionIsSettling() public {
        claimedAuction();

        assertEq(auction.pendingSettlement(), bytes32(0));
    }

    /// A claimed auction keeps its place in the list, so the scan has to step past it.
    function test_pendingSettlement_stepsPastAnAuctionThatIsAlreadySettling() public {
        fundExtraAuctions(1);
        bytes32 claimed = openAuctionWith(POLICY_HASH, PAYOUT_CAP);
        bytes32 next = openAuctionWith(POLICY_HASH, PAYOUT_CAP - 1);
        commitInOrder(claimed, 0, 1, 2);
        commitInOrder(next, 0, 1, 2);
        vm.warp(openedAt + BID_PERIOD);

        claim(claimed);

        assertEq(auction.pendingSettlement(), next);
    }

    /// Both terminal states drop the auction from the list the scan walks.
    function test_pendingSettlement_isZeroOnceEveryAuctionIsFinalizedOrTimedOut() public {
        fundExtraAuctions(1);
        bytes32 settled = openAuctionWith(POLICY_HASH, PAYOUT_CAP);
        bytes32 abandoned = openAuctionWith(POLICY_HASH, PAYOUT_CAP - 1);
        commitInOrder(settled, 0, 1, 2);
        commitInOrder(abandoned, 0, 1, 2);

        vm.warp(openedAt + BID_PERIOD);
        claim(settled);
        settle(winningSettlement(settled));

        vm.warp(openedAt + FINALIZE_PERIOD);
        auction.timeoutRefund(abandoned);

        assertEq(auction.pendingSettlement(), bytes32(0));
    }

    /// The cron settles one auction per tick, so every eligible auction has to come up in turn.
    function test_pendingSettlement_returnsEachEligibleAuctionInTurn() public {
        fundExtraAuctions(2);
        bytes32[3] memory opened;
        for (uint256 i = 0; i < 3; i++) {
            opened[i] = openAuctionWith(POLICY_HASH, PAYOUT_CAP - i);
            commitInOrder(opened[i], 0, 1, 2);
        }
        vm.warp(openedAt + BID_PERIOD);

        for (uint256 tick = 0; tick < 3; tick++) {
            bytes32 pending = auction.pendingSettlement();
            assertTrue(pending != bytes32(0), "an eligible auction is left");
            claim(pending);
            settle(winningSettlement(pending));
        }

        assertEq(auction.pendingSettlement(), bytes32(0), "and none is left");
        for (uint256 i = 0; i < 3; i++) {
            assertEq(uint8(stateOf(opened[i])), uint8(SealedAuction.State.Finalized));
        }
    }

    function test_commitments_returnsEveryCommitmentInArrivalOrder() public {
        bytes32 auctionId = openAuction();
        commitInOrder(auctionId, 2, 0, 1);

        bytes32[] memory stored = auction.commitments(auctionId);
        assertEq(stored.length, 3);
        assertEq(stored[0], placedBy(2));
        assertEq(stored[1], placedBy(0));
        assertEq(stored[2], placedBy(1));
    }

    function test_commitments_isEmptyForAnUnknownAuction() public view {
        assertEq(auction.commitments(keccak256("no such auction")).length, 0);
    }

    function test_committers_returnsEverySupplierInArrivalOrder() public {
        bytes32 auctionId = openAuction();
        commitInOrder(auctionId, 2, 0, 1);

        address[] memory stakers = auction.committers(auctionId);
        assertEq(stakers.length, 3);
        assertEq(stakers[0], SUPPLIER_C);
        assertEq(stakers[1], SUPPLIER_A);
        assertEq(stakers[2], SUPPLIER_B);
    }

    function test_commitmentOf_returnsWhatTheSupplierPlaced() public {
        bytes32 auctionId = openAuction();
        commitInOrder(auctionId, 2, 0, 1);

        assertEq(auction.commitmentOf(auctionId, SUPPLIER_A), placedBy(0));
        assertEq(auction.commitmentOf(auctionId, SUPPLIER_B), placedBy(1));
        assertEq(auction.commitmentOf(auctionId, SUPPLIER_C), placedBy(2));
    }

    /// A supplier that never committed reads as zero, so no caller has to catch a revert.
    function test_commitmentOf_isZeroForASupplierThatNeverCommitted() public {
        bytes32 auctionId = openAuction();
        commitInOrder(auctionId, 0, 1, 2);

        assertEq(auction.commitmentOf(auctionId, STRANGER), bytes32(0));
        assertEq(auction.commitmentOf(keccak256("no such auction"), SUPPLIER_A), bytes32(0));
    }

    function test_supportsInterface_answersForTheReceiverAndForERC165() public view {
        assertEq(type(IReceiver).interfaceId, bytes4(0x805f2132), "the forwarder probes this identifier");
        assertTrue(auction.supportsInterface(type(IReceiver).interfaceId));
        assertTrue(auction.supportsInterface(type(IERC165).interfaceId));
    }

    /**
     * A receiver that claims every identifier is skipped, and silently: the forwarder delivers
     * nothing while the workflow still reads a successful transaction.
     */
    function test_supportsInterface_rejectsTheWildcard() public view {
        assertFalse(auction.supportsInterface(0xffffffff));
    }

    function test_bidsRoot_isZeroWithNoCommitments() public {
        bytes32 auctionId = openAuction();

        assertEq(auction.bidsRoot(auctionId), bytes32(0));
    }

    /// The root is over the array as stored, so the arrival order is part of it.
    function test_bidsRoot_followsArrivalOrder() public {
        bytes32 ascending = openAuction();
        commitInOrder(ascending, 0, 1, 2);

        usdc.mint(BUYER, PAYOUT_CAP);
        bytes32 shuffled = openAuctionWith(keccak256("a second policy"));
        commitInOrder(shuffled, 2, 0, 1);

        assertEq(auction.bidsRoot(ascending), BIDS_ROOT);
        assertEq(auction.bidsRoot(shuffled), SHUFFLED_BIDS_ROOT);
    }

    function test_finalized_rejectsEveryFurtherStateChange() public {
        bytes32 auctionId = finalizedAuction();

        assertTerminal(auctionId);
    }

    function test_timeout_rejectsEveryFurtherStateChange() public {
        bytes32 auctionId = biddingClosedAuction();
        vm.warp(openedAt + FINALIZE_PERIOD);
        auction.timeoutRefund(auctionId);

        assertTerminal(auctionId);
    }

    /// @notice The public requirements under test: one double four-star room in Paris.
    function requirements() internal pure returns (SealedAuction.PublicRequirements memory) {
        return SealedAuction.PublicRequirements({
            city: "Paris",
            checkin: "2026-10-12",
            checkout: "2026-10-14",
            minStars: 4,
            roomType: "double",
            numberOfRooms: 1,
            tradeDownStars: 3
        });
    }

    function openAuction() internal returns (bytes32 auctionId) {
        return openAuctionWith(POLICY_HASH);
    }

    function openAuctionWith(bytes32 policyHash) internal returns (bytes32 auctionId) {
        return openAuctionWith(policyHash, PAYOUT_CAP);
    }

    /// Two auctions opened in one block need one term apart, and the cap is the cheapest to vary.
    function openAuctionWith(bytes32 policyHash, uint256 payoutCap) internal returns (bytes32 auctionId) {
        openedAt = uint64(block.timestamp);
        vm.prank(BUYER);
        auctionId = auction.createAuction(policyHash, requirements(), payoutCap);
    }

    /// `setUp` funds one cap, so a test that opens several auctions tops the buyer up first.
    function fundExtraAuctions(uint256 count) internal {
        usdc.mint(BUYER, count * PAYOUT_CAP);
    }

    /// An auction with all three commitments in and `bidDeadline` reached.
    function biddingClosedAuction() internal returns (bytes32 auctionId) {
        auctionId = openAuction();
        commitInOrder(auctionId, 0, 1, 2);
        vm.warp(openedAt + BID_PERIOD);
    }

    /// The same auction, claimed by the workflow and waiting for a settlement.
    function claimedAuction() internal returns (bytes32 auctionId) {
        auctionId = biddingClosedAuction();
        claim(auctionId);
    }

    /// The same auction, settled: supplier C wins at 440.
    function finalizedAuction() internal returns (bytes32 auctionId) {
        auctionId = claimedAuction();
        settle(winningSettlement(auctionId));
    }

    function claim(bytes32 auctionId) internal {
        vm.prank(FORWARDER);
        auction.onReport("", abi.encode(ACTION_CLAIM, abi.encode(auctionId)));
    }

    function settle(SealedAuction.Settlement memory settlement) internal {
        vm.prank(FORWARDER);
        auction.onReport("", abi.encode(ACTION_SETTLE, abi.encode(settlement)));
    }

    /// The first three suppliers commit, in the order given.
    function commitInOrder(bytes32 auctionId, uint256 first, uint256 second, uint256 third) internal {
        uint256[3] memory order = [first, second, third];
        for (uint256 i = 0; i < 3; i++) {
            vm.prank(supplier(order[i]));
            auction.commit(auctionId, placedBy(order[i]));
        }
    }

    function winningSettlement(bytes32 auctionId) internal pure returns (SealedAuction.Settlement memory) {
        return settlementOf(auctionId, SUPPLIER_C, PAYOUT);
    }

    /// No eligible bid, so no booking either.
    function noWinnerSettlement(bytes32 auctionId) internal pure returns (SealedAuction.Settlement memory) {
        SealedAuction.Settlement memory settlement = settlementOf(auctionId, address(0), 0);
        settlement.bookingId = "";
        return settlement;
    }

    function settlementOf(bytes32 auctionId, address winner, uint256 payout)
        internal
        pure
        returns (SealedAuction.Settlement memory)
    {
        return SealedAuction.Settlement({
            auctionId: auctionId,
            winner: winner,
            payout: payout,
            policyHash: POLICY_HASH,
            bidsRoot: BIDS_ROOT,
            bookingId: BOOKING_ID
        });
    }

    function supplier(uint256 index) internal pure returns (address) {
        address[6] memory suppliers =
            [SUPPLIER_A, SUPPLIER_B, SUPPLIER_C, address(0xA4), address(0xA5), address(0xA6)];
        return suppliers[index];
    }

    /// The commitment supplier `index` places. Their arrival order hashes to `BIDS_ROOT`.
    function placedBy(uint256 index) internal pure returns (bytes32) {
        bytes32[3] memory placed = [keccak256("A"), keccak256("B"), keccak256("C")];
        return placed[index];
    }

    function stateOf(bytes32 auctionId) internal view returns (SealedAuction.State state) {
        (state,,,,,,,,) = auction.auctions(auctionId);
    }

    /// Every supplier whole, the buyer whole, and nothing left in the escrow.
    function assertEverythingReturned(bytes32 auctionId) internal view {
        (,,,,,,,, uint256 payout) = auction.auctions(auctionId);

        assertEq(usdc.balanceOf(BUYER), PAYOUT_CAP, "the buyer gets the cap back");
        assertEq(usdc.balanceOf(SUPPLIER_A), SUPPLIER_FUNDING, "a stake is refunded");
        assertEq(usdc.balanceOf(SUPPLIER_B), SUPPLIER_FUNDING, "a stake is refunded");
        assertEq(usdc.balanceOf(SUPPLIER_C), SUPPLIER_FUNDING, "a stake is refunded");
        assertEq(usdc.balanceOf(address(auction)), 0, "the escrow is empty");
        assertEq(payout, 0);
    }

    /// No state-changing call reaches a terminal auction.
    function assertTerminal(bytes32 auctionId) internal {
        vm.prank(SUPPLIER_A);
        vm.expectRevert(SealedAuction.BadState.selector);
        auction.commit(auctionId, keccak256("late"));

        vm.expectRevert(SealedAuction.BadState.selector);
        claim(auctionId);

        vm.expectRevert(SealedAuction.BadState.selector);
        settle(winningSettlement(auctionId));

        vm.warp(openedAt + FINALIZE_PERIOD);
        vm.expectRevert(SealedAuction.BadState.selector);
        auction.timeoutRefund(auctionId);
    }
}
