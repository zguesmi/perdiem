// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

/// @title SealedAuction
/// @notice One confidential procurement auction. The contract plays the Escrow role: it holds the
///         buyer's Budget and every supplier's Stake, and it pays only against a settlement whose
///         policy hash and bids root match what was committed before bidding opened.
/// @dev    Nothing here is implemented yet. The full signature of `createAuction`, including the
///         public requirements and the enclave public key, lands with
///         `docs/scratch/build/01-policy-schema-and-scoring-formula.md`. What is fixed already is the
///         deadline ordering, so that no auction can exist that is undeliverable or unslashable.
contract SealedAuction {
    error NotImplemented();

    /// @notice Thrown when the three deadlines are not strictly increasing from now.
    error DeadlinesOutOfOrder();

    /// @notice Opens an auction and pulls the Budget from the buyer in the same call.
    /// @param bidDeadline      Last moment a supplier may commit and seal a bid.
    /// @param finalizeDeadline Last moment the settlement may land before anyone can refund.
    /// @param deliverDeadline  Last moment the winner may post a booking receipt.
    /// @param budget           USDC the buyer locks. Padded above the policy's maximum price, so the
    ///                         ceiling is not readable from the chain.
    /// @return auctionId       Identifier of the auction that was opened.
    /// @dev solc suggests restricting this to `pure`. It is left non-payable and non-pure because
    ///      the implementation writes auction state and pulls USDC. Restricting it now only means
    ///      undoing it later.
    function createAuction(uint64 bidDeadline, uint64 finalizeDeadline, uint64 deliverDeadline, uint256 budget)
        external
        returns (bytes32 auctionId)
    {
        bidDeadline;
        finalizeDeadline;
        deliverDeadline;
        budget;
        auctionId;
        revert NotImplemented();
    }
}
