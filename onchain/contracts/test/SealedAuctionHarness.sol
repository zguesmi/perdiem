// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {IERC20} from "../IERC20.sol";
import {SealedAuction} from "../SealedAuction.sol";

/// Test-only reach into `SealedAuction`.
///
/// `_startSettling` and `_settle` are internal because a workflow reaches them only through a report
/// to `onReport`, which is ticket 05. `pendingSettlement`, `commitmentsOf` and `auctionOf` are
/// ticket 20, so exposing the storage here keeps this ticket's tests off that ticket's read
/// surface.
contract SealedAuctionHarness is SealedAuction {
    constructor(IERC20 usdc_, address buyer_) SealedAuction(usdc_, buyer_) {}

    function exposedStartSettling(bytes32 auctionId) external {
        _startSettling(auctionId);
    }

    function exposedSettle(Settlement calldata settlement) external {
        _settle(settlement);
    }

    function exposedBidsRoot(bytes32 auctionId) external view returns (bytes32) {
        return _bidsRoot(auctionId);
    }

    function exposedAuction(bytes32 auctionId) external view returns (Auction memory) {
        return _auctions[auctionId];
    }

    function exposedCommitments(bytes32 auctionId) external view returns (bytes32[] memory) {
        return _commitments[auctionId];
    }
}
