// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {Test} from "forge-std/Test.sol";

import {SealedAuction} from "../SealedAuction.sol";
import {SealedAuctionHarness} from "./SealedAuctionHarness.sol";
import {MockUSDC} from "./MockUSDC.sol";

/// @notice The demo cast and the demo figures, shared by every `SealedAuction` test file.
///
/// The figures are the ones in `docs/spec.md`: a 750 Budget, a 50 Stake, three suppliers, and the
/// demo deadlines of creation + 90, + 180 and + 600 seconds. USDC has six decimals, verified on
/// chain in row V5 of `docs/decisions.md`.
abstract contract SealedAuctionFixture is Test {
    MockUSDC internal usdc;
    SealedAuctionHarness internal auction;

    address internal constant BUYER = address(0xB0);
    address internal constant SUPPLIER_A = address(0xA1);
    address internal constant SUPPLIER_B = address(0xA2);
    address internal constant SUPPLIER_C = address(0xA3);
    address internal constant STRANGER = address(0x5E);

    uint256 internal constant BUDGET = 750e6;
    uint256 internal constant STAKE = 50e6;

    /// @dev Ample: each supplier commits at most once per auction across the whole suite.
    uint256 internal constant SUPPLIER_FUNDING = 500e6;

    bytes32 internal constant POLICY_HASH = keccak256("the policy");
    bytes32 internal constant ENCLAVE_PUBLIC_KEY = keccak256("the enclave x25519 public key");

    /// The demo Payout: the winning Bid asked 440, and the price is paid first price.
    uint256 internal constant PAYOUT = 440e6;

    /// The three demo commitments, sorted ascending as unsigned 32-byte big-endian and hashed with
    /// `abi.encodePacked`. Computed off chain with viem, so a mistake in the Solidity sort cannot
    /// agree with itself. The cross-language fixture is ticket 19.
    bytes32 internal constant DEMO_BIDS_ROOT = 0x4bab02b90a0348eb8ab4956b0e013ef1c3d7a4d77ad3c9253857dd8d0e561d1f;

    function setUp() public virtual {
        usdc = new MockUSDC();
        auction = new SealedAuctionHarness(usdc, BUYER);

        usdc.mint(BUYER, BUDGET);
        usdc.mint(SUPPLIER_A, SUPPLIER_FUNDING);
        usdc.mint(SUPPLIER_B, SUPPLIER_FUNDING);
        usdc.mint(SUPPLIER_C, SUPPLIER_FUNDING);

        vm.prank(BUYER);
        usdc.approve(address(auction), type(uint256).max);
        for (uint256 i = 0; i < 3; i++) {
            vm.prank(supplier(i));
            usdc.approve(address(auction), type(uint256).max);
        }
    }

    /// @notice The Public Requirements of the demo auction: one double room near Gare du Nord.
    function demoRequirements() internal pure returns (SealedAuction.PublicRequirements memory) {
        return SealedAuction.PublicRequirements({
            city: "Paris",
            checkin: "2026-10-12",
            checkout: "2026-10-14",
            minStars: 4,
            roomType: "double",
            numberOfRooms: 1,
            locationName: "Gare du Nord",
            latitudeMicro: 48880900,
            longitudeMicro: 2355300,
            radiusMeters: 2000,
            tradeDownStars: 3
        });
    }

    function bidDeadline() internal view returns (uint64) {
        return uint64(block.timestamp + 90);
    }

    function finalizeDeadline() internal view returns (uint64) {
        return uint64(block.timestamp + 180);
    }

    function deliverDeadline() internal view returns (uint64) {
        return uint64(block.timestamp + 600);
    }

    /// @notice Opens the demo auction with the demo deadlines and the demo Budget.
    function createDemoAuction() internal returns (bytes32 auctionId) {
        vm.prank(BUYER);
        auctionId = auction.createAuction(
            POLICY_HASH,
            demoRequirements(),
            ENCLAVE_PUBLIC_KEY,
            bidDeadline(),
            finalizeDeadline(),
            deliverDeadline(),
            BUDGET
        );
    }

    function supplier(uint256 index) internal pure returns (address) {
        address[3] memory suppliers = [SUPPLIER_A, SUPPLIER_B, SUPPLIER_C];
        return suppliers[index];
    }

    /// The commitment supplier `index` places. Their sorted set hashes to `DEMO_BIDS_ROOT`.
    function commitmentOf(uint256 index) internal pure returns (bytes32) {
        bytes32[3] memory commitments = [keccak256("A"), keccak256("B"), keccak256("C")];
        return commitments[index];
    }

    /// All three suppliers commit, in the order given, so that a test can prove arrival order does
    /// not reach the Bids Root.
    function commitInOrder(bytes32 auctionId, uint256 first, uint256 second, uint256 third) internal {
        uint256[3] memory order = [first, second, third];
        for (uint256 i = 0; i < 3; i++) {
            vm.prank(supplier(order[i]));
            auction.commit(auctionId, commitmentOf(order[i]));
        }
    }

    /// An auction with all three commitments in and `bidDeadline` reached.
    function biddingClosedAuction() internal returns (bytes32 auctionId) {
        auctionId = createDemoAuction();
        commitInOrder(auctionId, 0, 1, 2);
        vm.warp(auction.exposedAuction(auctionId).bidDeadline);
    }

    /// The same auction, claimed by the workflow and waiting for a settlement.
    function claimedAuction() internal returns (bytes32 auctionId) {
        auctionId = biddingClosedAuction();
        auction.exposedStartSettling(auctionId);
    }

    /// The same auction, settled on the demo result: supplier C wins at 440.
    function finalizedAuction() internal returns (bytes32 auctionId) {
        auctionId = claimedAuction();
        auction.exposedSettle(winningSettlement(auctionId));
    }

    function winningSettlement(bytes32 auctionId) internal pure returns (SealedAuction.Settlement memory) {
        return settlementOf(auctionId, SUPPLIER_C, PAYOUT);
    }

    function noWinnerSettlement(bytes32 auctionId) internal pure returns (SealedAuction.Settlement memory) {
        return settlementOf(auctionId, address(0), 0);
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
            bidsRoot: DEMO_BIDS_ROOT
        });
    }
}
