// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {IERC20} from "./IERC20.sol";

/// @title SealedAuction
/// @notice One confidential booking auction. The contract plays the Escrow role: it holds the
///         buyer's Budget and every supplier's Stake, and it pays only against a settlement whose
///         Policy Hash and Bids Root match what was committed before bidding auction.
contract SealedAuction {
    enum State {
        None,
        Created,
        Bidding,
        Settling,
        Finalized,
        Timeout
    }

    /// The subset of the Policy that is public. Emitted, never stored: suppliers read it from the
    /// log, and no on-chain rule depends on it.
    struct PublicRequirements {
        string city;
        string checkin;
        string checkout;
        uint8 minStars;
        string roomType;
        uint8 numberOfRooms;
        string locationName;
        int32 latitudeMicro;
        int32 longitudeMicro;
        uint32 radiusMeters;
        uint8 tradeDownStars;
    }

    struct Auction {
        State state;
        address buyer;
        uint64 bidDeadline;
        uint64 finalizeDeadline;
        uint64 deliverDeadline;
        uint64 createdBlock;
        bytes32 policyHash;
        bytes32 enclavePublicKey;
        uint256 budget;
        address winner;
        uint256 payout;
        bytes32 receiptHash;
        bool stakeReleased;
        bool stakeSlashed;
    }

    /// @notice USDC a supplier locks when committing a Bid. Six decimals, verified on chain in row
    ///         V5 of `docs/decisions.md`.
    uint256 public constant STAKE = 50e6;

    IERC20 public immutable usdc;

    /// @notice The single buyer. One buyer per deployment is a stated non-goal of the demo.
    address public immutable buyer;

    uint256 internal _auctionCount;

    mapping(bytes32 => Auction) internal _auctions;

    event AuctionCreated(
        bytes32 indexed auctionId,
        address indexed buyer,
        bytes32 policyHash,
        bytes32 enclavePublicKey,
        uint64 bidDeadline,
        uint64 finalizeDeadline,
        uint64 deliverDeadline,
        uint256 budget,
        PublicRequirements requirements
    );


    /// @notice Thrown when the three deadlines are not strictly increasing from now.
    error DeadlinesOutOfOrder();
    error NotBuyer();
    error TransferFailed();

    constructor(IERC20 usdc_, address buyer_) {
        usdc = usdc_;
        buyer = buyer_;
    }

    /// @notice Opens an auction and pulls the Budget from the buyer in the same call.
    /// @param policyHash       keccak256 of the canonically encoded Policy, committed before any Bid
    ///                         exists.
    /// @param requirements     The Public Requirements, emitted for suppliers to bid against.
    /// @param enclavePublicKey The X25519 public half suppliers seal their Bids to.
    /// @param bidDeadline      Last moment a supplier may commit and seal a bid.
    /// @param finalizeDeadline Last moment the settlement may land before anyone can refund.
    /// @param deliverDeadline  Last moment the winner may post a booking receipt.
    /// @param budget           USDC the buyer locks. Padded above the policy's maximum price, so the
    ///                         ceiling is not readable from the chain.
    /// @return auctionId       Identifier of the auction that was auction.
    function createAuction(
        bytes32 policyHash,
        PublicRequirements calldata requirements,
        bytes32 enclavePublicKey,
        uint64 bidDeadline,
        uint64 finalizeDeadline,
        uint64 deliverDeadline,
        uint256 budget
    ) external returns (bytes32 auctionId) {
        if (msg.sender != buyer) revert NotBuyer();
        if (!(block.timestamp < bidDeadline && bidDeadline < finalizeDeadline && finalizeDeadline < deliverDeadline)) {
            revert DeadlinesOutOfOrder();
        }

        auctionId = bytes32(++_auctionCount);

        Auction storage auction = _auctions[auctionId];
        auction.state = State.Created;
        auction.buyer = msg.sender;
        auction.bidDeadline = bidDeadline;
        auction.finalizeDeadline = finalizeDeadline;
        auction.deliverDeadline = deliverDeadline;
        auction.createdBlock = uint64(block.number);
        auction.policyHash = policyHash;
        auction.enclavePublicKey = enclavePublicKey;
        auction.budget = budget;

        _pull(msg.sender, budget);

        emit AuctionCreated(
            auctionId,
            msg.sender,
            policyHash,
            enclavePublicKey,
            bidDeadline,
            finalizeDeadline,
            deliverDeadline,
            budget,
            requirements
        );
    }

    function _pull(address from, uint256 amount) internal {
        if (!usdc.transferFrom(from, address(this), amount)) revert TransferFailed();
    }
}
