// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title SealedAuction
 * @notice Confidential booking auctions. The contract plays the Escrow role: it holds each buyer's
 *         payout cap and every supplier's Stake, and it pays only against a settlement whose Policy
 *         Hash and Bids Root match what was committed before bidding opened.
 */
contract SealedAuction {
    using SafeERC20 for IERC20;

    enum State {
        None,
        Created,
        Bidding,
        Settling,
        Finalized,
        Timeout
    }

    /**
     * The subset of the Policy that is public. Emitted, never stored: suppliers read it from the
     * log, and no on-chain rule depends on it.
     */
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

    /**
     * The auction record. Its keccak256 is the `auctionId`, so every field below is fixed at
     * creation time and the identifier commits to all of them. `winner`, `payout`, `stakeReleased`
     * and `stakeSlashed` are zero when the hash is taken and are written afterwards.
     */
    struct Auction {
        State state;
        address buyer;
        uint64 createdAt;
        uint64 bidDeadline;
        uint64 finalizeDeadline;
        uint64 receiptDeadline;
        bytes32 policyHash;
        uint256 payoutCap;
        address winner;
        uint256 payout;
        bool stakeReleased;
        bool stakeSlashed;
    }

    /// @notice USDC a supplier locks when committing a Bid.
    uint256 public constant STAKE = 50e6;

    /// @notice How long after creation a supplier may commit and seal a Bid.
    uint64 public constant BID_PERIOD = 2 hours;

    /// @notice How long after creation a settlement may land before anyone can refund the auction.
    uint64 public constant FINALIZE_PERIOD = 4 hours;

    /// @notice How long after creation the winner may post a booking Receipt.
    uint64 public constant RECEIPT_PERIOD = 6 hours;

    /// A claim report, which moves an auction from `Bidding` to `Settling`.
    uint8 private constant REPORT_CLAIM = 1;

    /// A settlement report, which finalizes an auction.
    uint8 private constant REPORT_SETTLEMENT = 2;

    IERC20 public immutable usdc;

    /// @notice The only address `onReport` accepts a report from.
    address public immutable forwarder;

    /// @notice The X25519 public half suppliers seal their Bids to. One key per deployment.
    bytes32 public immutable enclavePublicKey;

    mapping(bytes32 => Auction) public auctions;

    mapping(bytes32 => bytes32[]) internal _commitments;
    mapping(bytes32 => mapping(address => bool)) internal _hasCommitted;
    mapping(bytes32 => address[]) internal _committers;

    event AuctionCreated(
        bytes32 indexed auctionId,
        address indexed buyer,
        uint64 createdAt,
        uint64 bidDeadline,
        uint64 finalizeDeadline,
        uint64 receiptDeadline
    );
    event TermsPublished(bytes32 indexed auctionId, uint256 payoutCap, PublicRequirements requirements);
    event Committed(bytes32 indexed auctionId, address indexed supplier, bytes32 commitment);
    event AuctionClaimed(bytes32 indexed auctionId);
    event AuctionFinalized(bytes32 indexed auctionId, address indexed winner, uint256 payout);
    event AuctionTimedOut(bytes32 indexed auctionId);
    event ReceiptPosted(bytes32 indexed auctionId, address indexed winner, bytes32 receiptHash);
    event StakeSlashed(bytes32 indexed auctionId, address indexed winner, address indexed buyer);

    error AuctionAlreadyExists();
    error WrongState();
    error BiddingClosed();
    error AlreadyCommitted();
    error NotForwarder();
    error UnknownReportKind();
    error BiddingNotClosed();
    error TooEarly();
    error PolicyHashMismatch();
    error BidsRootMismatch();
    error PayoutAboveCap();
    error PayoutWithoutWinner();
    error WinnerWithoutPayout();
    error WinnerNeverCommitted();
    error NotWinner();
    error DeliveryClosed();
    error StakeAlreadySettled();

    constructor(IERC20 usdc_, address forwarder_, bytes32 enclavePublicKey_) {
        usdc = usdc_;
        forwarder = forwarder_;
        enclavePublicKey = enclavePublicKey_;
    }

    /**
     * @notice Opens an auction and pulls the payout cap from the caller in the same call.
     * @param policyHash   keccak256 of the canonically encoded Policy, committed before any Bid
     *                     exists.
     * @param requirements The Public Requirements, emitted for suppliers to bid against.
     * @param payoutCap    USDC the buyer locks. It bounds the Payout and nothing else, and it sits
     *                     above the Policy's maximum price so that the ceiling is not readable from
     *                     the chain.
     * @return auctionId   keccak256 of the auction record, so the identifier commits to the Policy
     *                     Hash, the buyer, the cap and the deadlines.
     */
    function createAuction(bytes32 policyHash, PublicRequirements calldata requirements, uint256 payoutCap)
        external
        returns (bytes32 auctionId)
    {
        uint64 createdAt = uint64(block.timestamp);
        Auction memory opened = Auction({
            state: State.Created,
            buyer: msg.sender,
            createdAt: createdAt,
            bidDeadline: createdAt + BID_PERIOD,
            finalizeDeadline: createdAt + FINALIZE_PERIOD,
            receiptDeadline: createdAt + RECEIPT_PERIOD,
            policyHash: policyHash,
            payoutCap: payoutCap,
            winner: address(0),
            payout: 0,
            stakeReleased: false,
            stakeSlashed: false
        });

        auctionId = keccak256(abi.encode(opened));
        if (auctions[auctionId].state != State.None) revert AuctionAlreadyExists();
        auctions[auctionId] = opened;

        usdc.safeTransferFrom(msg.sender, address(this), payoutCap);

        emit AuctionCreated(
            auctionId, msg.sender, createdAt, opened.bidDeadline, opened.finalizeDeadline, opened.receiptDeadline
        );
        emit TermsPublished(auctionId, payoutCap, requirements);
    }

    /**
     * @notice Binds one Bid on chain and pulls the Stake. Once per address, before `bidDeadline`.
     * @dev The first commit opens bidding, so no separate transaction moves `Created` to `Bidding`.
     */
    function commit(bytes32 auctionId, bytes32 commitment) external {
        Auction storage auction = auctions[auctionId];
        if (auction.state != State.Created && auction.state != State.Bidding) revert WrongState();
        if (block.timestamp >= auction.bidDeadline) revert BiddingClosed();
        if (_hasCommitted[auctionId][msg.sender]) revert AlreadyCommitted();

        _hasCommitted[auctionId][msg.sender] = true;
        _commitments[auctionId].push(commitment);
        _committers[auctionId].push(msg.sender);
        if (auction.state == State.Created) auction.state = State.Bidding;

        usdc.safeTransferFrom(msg.sender, address(this), STAKE);

        emit Committed(auctionId, msg.sender, commitment);
    }

    /**
     * @notice The only entry a workflow has. Takes a report from the forwarder and dispatches on its
     *         kind: `1` claims an auction, `2` settles one.
     * @dev Nothing is read from `metadata`. `report` is `abi.encode(uint8 kind, bytes payload)`; the
     *      claim payload is `abi.encode(bytes32 auctionId)` and the settlement payload is
     *      `abi.encode(Settlement)`.
     */
    function onReport(bytes calldata, bytes calldata report) external {
        if (msg.sender != forwarder) revert NotForwarder();

        (uint8 kind, bytes memory payload) = abi.decode(report, (uint8, bytes));
        if (kind == REPORT_CLAIM) {
            _startSettling(abi.decode(payload, (bytes32)));
        } else if (kind == REPORT_SETTLEMENT) {
            _settle(abi.decode(payload, (Settlement)));
        } else {
            revert UnknownReportKind();
        }
    }

    /**
     * @notice Releases the winner's Stake against a booking Receipt, the keccak256 of the booking
     *         id. The winner only, before `receiptDeadline`.
     */
    function submitReceipt(bytes32 auctionId, bytes32 receiptHash) external {
        Auction storage auction = auctions[auctionId];
        if (auction.state != State.Finalized) revert WrongState();
        if (msg.sender != auction.winner || auction.winner == address(0)) revert NotWinner();
        if (block.timestamp >= auction.receiptDeadline) revert DeliveryClosed();
        if (auction.stakeReleased || auction.stakeSlashed) revert StakeAlreadySettled();

        auction.stakeReleased = true;

        usdc.safeTransfer(auction.winner, STAKE);

        emit ReceiptPosted(auctionId, auction.winner, receiptHash);
    }

    /**
     * @notice Pays the winner's Stake to the buyer once `receiptDeadline` has passed with no
     *         Receipt. Anyone may call it.
     */
    function slash(bytes32 auctionId) external {
        Auction storage auction = auctions[auctionId];
        if (auction.state != State.Finalized) revert WrongState();
        if (auction.winner == address(0)) revert NotWinner();
        if (block.timestamp < auction.receiptDeadline) revert TooEarly();
        if (auction.stakeReleased || auction.stakeSlashed) revert StakeAlreadySettled();

        auction.stakeSlashed = true;

        usdc.safeTransfer(auction.buyer, STAKE);

        emit StakeSlashed(auctionId, auction.winner, auction.buyer);
    }

    /**
     * @notice Refunds the locked USDC and every Stake once `finalizeDeadline` has passed with no
     *         settlement. Anyone may call it. A liveness fallback, and only that.
     * @dev `Created` is refundable too. Without it the USDC of an auction nobody bid on is stuck
     *      forever.
     */
    function timeoutRefund(bytes32 auctionId) external {
        Auction storage auction = auctions[auctionId];
        if (auction.state != State.Created && auction.state != State.Bidding && auction.state != State.Settling) {
            revert WrongState();
        }
        if (block.timestamp < auction.finalizeDeadline) revert TooEarly();

        auction.state = State.Timeout;

        usdc.safeTransfer(auction.buyer, auction.payoutCap);
        _refundStakes(auctionId, address(0));

        emit AuctionTimedOut(auctionId);
    }

    /// @notice Every Bid Commitment placed on an auction, in arrival order.
    function commitmentsOf(bytes32 auctionId) external view returns (bytes32[] memory) {
        return _commitments[auctionId];
    }

    /**
     * @notice The Bids Root the Enclave builds, recomputed here. One byte of difference rejects a
     *         correct settlement, so the construction is exact: every commitment for the auction,
     *         sorted ascending as unsigned 32-byte big-endian, hashed with `abi.encodePacked`.
     */
    function bidsRoot(bytes32 auctionId) public view returns (bytes32) {
        bytes32[] storage stored = _commitments[auctionId];
        uint256 length = stored.length;
        if (length == 0) return bytes32(0);

        bytes32[] memory sorted = new bytes32[](length);
        for (uint256 i = 0; i < length; i++) {
            sorted[i] = stored[i];
        }
        // Insertion sort. `commit` is once per address, so the set stays small.
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

    /**
     * @notice Claims the auction for the workflow, so that a stalled run can be told from a run
     *         whose settlement was rejected.
     */
    function _startSettling(bytes32 auctionId) internal {
        Auction storage auction = auctions[auctionId];
        if (auction.state != State.Bidding) revert WrongState();
        if (block.timestamp < auction.bidDeadline) revert BiddingNotClosed();

        auction.state = State.Settling;

        emit AuctionClaimed(auctionId);
    }

    /// @notice Pays the winner, refunds the buyer and refunds the losing Stakes.
    function _settle(Settlement memory settlement) internal {
        Auction storage auction = auctions[settlement.auctionId];
        if (auction.state != State.Settling) revert WrongState();
        if (settlement.policyHash != auction.policyHash) revert PolicyHashMismatch();
        if (settlement.bidsRoot != bidsRoot(settlement.auctionId)) revert BidsRootMismatch();
        if (settlement.payout > auction.payoutCap) revert PayoutAboveCap();
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

        if (settlement.winner != address(0)) usdc.safeTransfer(settlement.winner, settlement.payout);
        usdc.safeTransfer(auction.buyer, auction.payoutCap - settlement.payout);
        _refundStakes(settlement.auctionId, settlement.winner);

        emit AuctionFinalized(settlement.auctionId, settlement.winner, settlement.payout);
    }

    /// The winner's Stake stays in the escrow until a Receipt releases it or a slash pays it out.
    function _refundStakes(bytes32 auctionId, address winner) internal {
        address[] storage committers = _committers[auctionId];
        for (uint256 i = 0; i < committers.length; i++) {
            if (committers[i] != winner) usdc.safeTransfer(committers[i], STAKE);
        }
    }
}
