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

    /// What the Enclave reports. The only thing that leaves it.
    struct Settlement {
        bytes32 auctionId;
        address winner;
        uint256 payout;
        bytes32 policyHash;
        bytes32 bidsRoot;
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
    mapping(bytes32 => bytes32[]) internal _commitments;
    mapping(bytes32 => mapping(address => bool)) internal _hasCommitted;
    mapping(bytes32 => address[]) internal _committers;

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

    event Committed(bytes32 indexed auctionId, address indexed supplier, bytes32 commitment);
    event AuctionClaimed(bytes32 indexed auctionId);
    event AuctionFinalized(bytes32 indexed auctionId, address indexed winner, uint256 payout);
    event AuctionTimedOut(bytes32 indexed auctionId);
    event ReceiptPosted(bytes32 indexed auctionId, address indexed winner, bytes32 receiptHash);
    event StakeSlashed(bytes32 indexed auctionId, address indexed winner, address indexed buyer);

    /// @notice Thrown when the three deadlines are not strictly increasing from now.
    error DeadlinesOutOfOrder();
    error NotBuyer();
    error WrongState();
    error BiddingClosed();
    error AlreadyCommitted();
    error BiddingNotClosed();
    error TooEarly();
    error PolicyHashMismatch();
    error BidsRootMismatch();
    error PayoutAboveBudget();
    error PayoutWithoutWinner();
    error WinnerWithoutPayout();
    error WinnerNeverCommitted();
    error NotWinner();
    error DeliveryClosed();
    error StakeAlreadySettled();
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

    /// @notice Binds one Bid on chain and pulls the Stake. Once per address, before `bidDeadline`.
    /// @dev The first commit opens bidding, so no separate transaction moves `Created → Bidding`.
    function commit(bytes32 auctionId, bytes32 commitment) external {
        Auction storage auction = _auctions[auctionId];
        if (auction.state != State.Created && auction.state != State.Bidding) revert WrongState();
        if (block.timestamp >= auction.bidDeadline) revert BiddingClosed();
        if (_hasCommitted[auctionId][msg.sender]) revert AlreadyCommitted();

        _hasCommitted[auctionId][msg.sender] = true;
        _commitments[auctionId].push(commitment);
        _committers[auctionId].push(msg.sender);
        if (auction.state == State.Created) auction.state = State.Bidding;

        _pull(msg.sender, STAKE);

        emit Committed(auctionId, msg.sender, commitment);
    }

    /// @notice Releases the winner's Stake against a booking Receipt, the keccak256 of the LiteAPI
    ///         booking id. The winner only, before `deliverDeadline`.
    function submitReceipt(bytes32 auctionId, bytes32 receiptHash) external {
        Auction storage auction = _auctions[auctionId];
        if (auction.state != State.Finalized) revert WrongState();
        if (msg.sender != auction.winner || auction.winner == address(0)) revert NotWinner();
        if (block.timestamp >= auction.deliverDeadline) revert DeliveryClosed();
        if (auction.stakeReleased || auction.stakeSlashed) revert StakeAlreadySettled();

        auction.receiptHash = receiptHash;
        auction.stakeReleased = true;

        _push(auction.winner, STAKE);

        emit ReceiptPosted(auctionId, auction.winner, receiptHash);
    }

    /// @notice Pays the winner's Stake to the buyer once `deliverDeadline` has passed with no
    ///         Receipt. Anyone may call it.
    function slash(bytes32 auctionId) external {
        Auction storage auction = _auctions[auctionId];
        if (auction.state != State.Finalized) revert WrongState();
        if (auction.winner == address(0)) revert NotWinner();
        if (block.timestamp < auction.deliverDeadline) revert TooEarly();
        if (auction.stakeReleased || auction.stakeSlashed) revert StakeAlreadySettled();

        auction.stakeSlashed = true;

        _push(auction.buyer, STAKE);

        emit StakeSlashed(auctionId, auction.winner, auction.buyer);
    }

    /// @notice Refunds the Budget and every Stake once `finalizeDeadline` has passed with no
    ///         settlement. Anyone may call it. A liveness fallback, and only that.
    /// @dev `Created` is refundable too. Without it the Budget of an auction nobody bid on is stuck
    ///      forever, and row five of "Every USDC in and out" in `docs/spec.md` never returns.
    function timeoutRefund(bytes32 auctionId) external {
        Auction storage auction = _auctions[auctionId];
        if (auction.state != State.Created && auction.state != State.Bidding && auction.state != State.Settling) {
            revert WrongState();
        }
        if (block.timestamp < auction.finalizeDeadline) revert TooEarly();

        auction.state = State.Timeout;

        _push(auction.buyer, auction.budget);
        _refundStakes(auctionId, address(0));

        emit AuctionTimedOut(auctionId);
    }

    /// @notice Claims the auction for the workflow, so that the demo can tell "the workflow never
    ///         ran" from "the workflow ran and its settlement was rejected".
    /// @dev Internal: a workflow reaches it only through a kind `1` report to `onReport`.
    function _startSettling(bytes32 auctionId) internal {
        Auction storage auction = _auctions[auctionId];
        if (auction.state != State.Bidding) revert WrongState();
        if (block.timestamp < auction.bidDeadline) revert BiddingNotClosed();

        auction.state = State.Settling;

        emit AuctionClaimed(auctionId);
    }

    /// @notice Pays the winner, refunds the buyer and refunds the losing Stakes.
    /// @dev Internal: a workflow reaches it only through a kind `2` report to `onReport`.
    function _settle(Settlement calldata settlement) internal {
        Auction storage auction = _auctions[settlement.auctionId];
        if (auction.state != State.Settling) revert WrongState();
        if (settlement.policyHash != auction.policyHash) revert PolicyHashMismatch();
        if (settlement.bidsRoot != _bidsRoot(settlement.auctionId)) revert BidsRootMismatch();
        if (settlement.payout > auction.budget) revert PayoutAboveBudget();
        if (settlement.winner == address(0)) {
            if (settlement.payout != 0) revert PayoutWithoutWinner();
        } else if (!_hasCommitted[settlement.auctionId][settlement.winner]) {
            revert WinnerNeverCommitted();
        } else if (settlement.payout == 0) {
            // `payout` is the winning Bid's price. A named winner paid nothing would have its Stake
            // held against a delivery nobody bought.
            revert WinnerWithoutPayout();
        }

        auction.state = State.Finalized;
        auction.winner = settlement.winner;
        auction.payout = settlement.payout;

        _push(settlement.winner, settlement.payout);
        _push(auction.buyer, auction.budget - settlement.payout);
        _refundStakes(settlement.auctionId, settlement.winner);

        emit AuctionFinalized(settlement.auctionId, settlement.winner, settlement.payout);
    }

    /// The Bids Root the Enclave builds, recomputed here. One byte of difference rejects a correct
    /// settlement, so the construction is exact: every commitment for the auction, sorted ascending
    /// as unsigned 32-byte big-endian, hashed with `abi.encodePacked`.
    function _bidsRoot(bytes32 auctionId) internal view returns (bytes32) {
        bytes32[] storage stored = _commitments[auctionId];
        uint256 length = stored.length;
        if (length == 0) return bytes32(0);

        bytes32[] memory sorted = new bytes32[](length);
        for (uint256 i = 0; i < length; i++) {
            sorted[i] = stored[i];
        }
        // Insertion sort. `commit` is once per address, so the demo sorts three items.
        for (uint256 i = 1; i < length; i++) {
            bytes32 value = sorted[i];
            uint256 j = i;
            while (j > 0 && uint256(sorted[j - 1]) > uint256(value)) {
                sorted[j] = sorted[j - 1];
                j--;
            }
            sorted[j] = value;
        }

        return keccak256(abi.encodePacked(sorted));
    }

    /// The winner's Stake stays in the escrow until a Receipt releases it or a slash pays it out.
    function _refundStakes(bytes32 auctionId, address winner) internal {
        address[] storage committers = _committers[auctionId];
        for (uint256 i = 0; i < committers.length; i++) {
            if (committers[i] != winner) _push(committers[i], STAKE);
        }
    }

    function _pull(address from, uint256 amount) internal {
        if (!usdc.transferFrom(from, address(this), amount)) revert TransferFailed();
    }

    function _push(address to, uint256 amount) internal {
        if (amount == 0) return;
        if (!usdc.transfer(to, amount)) revert TransferFailed();
    }
}
