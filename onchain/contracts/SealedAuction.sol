// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IReceiver} from "./IReceiver.sol";

/**
 * @title SealedAuction
 * @notice Confidential booking auctions. The contract plays the Escrow role: it holds each buyer's
 * payout cap and every supplier's stake, and it pays only against a settlement whose policy hash and
 * bids root match what was committed before bidding opened.
 */
contract SealedAuction is IReceiver {
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
     * The subset of the policy that is public. Emitted, never stored: suppliers read it from the
     * log, and no on-chain rule depends on it.
     */
    struct PublicRequirements {
        string city;
        string checkin;
        string checkout;
        uint8 minStars;
        string roomType;
        uint8 numberOfRooms;
        uint8 tradeDownStars;
    }

    /**
     * What the enclave reports. The only thing that leaves it.
     *
     * `policyHash` and `bidsRoot` are the enclave's claim about what it scored. The contract holds
     * both values already and rejects the settlement when either disagrees, so an enclave that
     * loaded the wrong policy secret, or scored a subset of the commitments, cannot pay anyone.
     *
     * `bookingId` is the reference the enclave read back from the winning supplier's own API. It is
     * emitted and stored nowhere, and a winner without one is rejected, so no payout exists without
     * a booking. See `docs/adr/0006-the-enclave-books-with-supplier-credentials.md`.
     */
    struct Settlement {
        bytes32 auctionId;
        address winner;
        uint256 payout;
        bytes32 policyHash;
        bytes32 bidsRoot;
        string bookingId;
    }

    /**
     * The auction record. Its keccak256 is the `auctionId`, so every field below is fixed at
     * creation time and the identifier commits to all of them. `winner` and `payout` are zero when
     * the hash is taken and are written afterwards.
     */
    struct Auction {
        State state;
        address buyer;
        uint64 createdAt;
        uint64 bidDeadline;
        uint64 finalizeDeadline;
        bytes32 policyHash;
        uint256 payoutCap;
        address winner;
        uint256 payout;
    }

    /// USDC a supplier locks when committing a bid.
    uint256 public constant SUPPLIER_STAKE = 50e6;

    /// Commitments per auction. Settlement and every refund walk the array, so it stays bounded.
    uint256 public constant MAX_BIDS = 5;

    /// Auctions that are neither finalized nor timed out. `pendingSettlement` walks them all.
    uint256 public constant MAX_OPEN_AUCTIONS = 32;

    /// How long after creation a supplier may commit and seal a bid.
    uint64 public constant BID_PERIOD = 2 hours;

    /// How long after creation a settlement may land before anyone can refund the auction.
    uint64 public constant FINALIZE_PERIOD = 4 hours;

    /// A claim report, which moves an auction from `Bidding` to `Settling`.
    uint8 private constant ACTION_CLAIM = 1;

    /// A settlement report, which finalizes an auction.
    uint8 private constant ACTION_SETTLE = 2;

    IERC20 public immutable usdc;

    /// The only address `onReport` accepts a report from.
    address public immutable forwarder;

    /// The X25519 public half suppliers seal their bids to. One key per deployment.
    bytes32 public immutable enclavePublicKey;

    mapping(bytes32 => Auction) public auctions;

    /**
     * Every auction that has not reached a terminal state. An `auctionId` is the hash of its
     * record, so there is no counter to walk and a list is the only way to find one.
     */
    bytes32[] internal _openAuctions;

    /// The workflow and the relay read all three through the getters below.
    mapping(bytes32 => bytes32[]) internal _commitments;
    mapping(bytes32 => address[]) internal _committers;
    mapping(bytes32 => mapping(address => bool)) internal _hasCommitted;

    event AuctionCreated(
        bytes32 indexed auctionId,
        address indexed buyer,
        uint64 createdAt,
        uint64 bidDeadline,
        uint64 finalizeDeadline
    );
    event TermsPublished(bytes32 indexed auctionId, uint256 payoutCap, PublicRequirements requirements);
    event Committed(bytes32 indexed auctionId, address indexed supplier, bytes32 commitment);
    event AuctionClaimed(bytes32 indexed auctionId);
    event AuctionFinalized(bytes32 indexed auctionId, address indexed winner, uint256 payout, string bookingId);
    event AuctionTimedOut(bytes32 indexed auctionId);

    error AuctionAlreadyExists();
    error OpenAuctionLimitReached();
    error BadState();
    error BiddingClosed();
    error AlreadyCommitted();
    error BidLimitReached();
    error NotForwarder();
    error UnknownReportAction();
    error BiddingNotClosed();
    error TooEarly();
    error PolicyHashMismatch();
    error BidsRootMismatch();
    error PayoutAboveCap();
    error PayoutWithoutWinner();
    error WinnerWithoutPayout();
    error WinnerNeverCommitted();
    error MissingBookingId();

    modifier onlyForwarder() {
        if (msg.sender != forwarder) {
            revert NotForwarder();
        }
        _;
    }

    constructor(IERC20 usdc_, address forwarder_, bytes32 enclavePublicKey_) {
        usdc = usdc_;
        forwarder = forwarder_;
        enclavePublicKey = enclavePublicKey_;
    }

    /**
     * @notice Opens an auction and pulls the payout cap from the caller in the same call.
     * @param policyHash keccak256 of the canonically encoded policy, committed before any bid
     * exists.
     * @param requirements The public requirements, emitted for suppliers to bid against.
     * @param payoutCap USDC the buyer locks. It bounds the payout and nothing else, and it sits
     * above the policy's maximum price so that the ceiling is not readable from the chain.
     * @return auctionId keccak256 of the auction record, so the identifier commits to the policy
     * hash, the buyer, the cap and the deadlines.
     */
    function createAuction(bytes32 policyHash, PublicRequirements calldata requirements, uint256 payoutCap)
        external
        returns (bytes32 auctionId)
    {
        if (_openAuctions.length == MAX_OPEN_AUCTIONS) {
            revert OpenAuctionLimitReached();
        }

        uint64 createdAt = uint64(block.timestamp);
        Auction memory opened = Auction({
            state: State.Created,
            buyer: msg.sender,
            createdAt: createdAt,
            bidDeadline: createdAt + BID_PERIOD,
            finalizeDeadline: createdAt + FINALIZE_PERIOD,
            policyHash: policyHash,
            payoutCap: payoutCap,
            winner: address(0),
            payout: 0
        });

        auctionId = keccak256(abi.encode(opened));
        if (auctions[auctionId].state != State.None) {
            revert AuctionAlreadyExists();
        }
        auctions[auctionId] = opened;
        _openAuctions.push(auctionId);

        usdc.safeTransferFrom(msg.sender, address(this), payoutCap);

        emit AuctionCreated(auctionId, msg.sender, createdAt, opened.bidDeadline, opened.finalizeDeadline);
        emit TermsPublished(auctionId, payoutCap, requirements);
    }

    /**
     * @notice Binds one bid on chain and pulls the stake. Once per address, before `bidDeadline`.
     * @dev The first commit opens bidding, so no separate transaction moves `Created` to `Bidding`.
     */
    function commit(bytes32 auctionId, bytes32 commitment) external {
        Auction storage auction = auctions[auctionId];
        if (auction.state != State.Created && auction.state != State.Bidding) {
            revert BadState();
        }
        if (block.timestamp >= auction.bidDeadline) {
            revert BiddingClosed();
        }
        if (_hasCommitted[auctionId][msg.sender]) {
            revert AlreadyCommitted();
        }
        if (_commitments[auctionId].length == MAX_BIDS) {
            revert BidLimitReached();
        }

        _hasCommitted[auctionId][msg.sender] = true;
        _commitments[auctionId].push(commitment);
        _committers[auctionId].push(msg.sender);
        if (auction.state == State.Created) {
            auction.state = State.Bidding;
        }

        usdc.safeTransferFrom(msg.sender, address(this), SUPPLIER_STAKE);

        emit Committed(auctionId, msg.sender, commitment);
    }

    /**
     * @notice The only entry a workflow has. Takes a report from the forwarder and dispatches on its
     * action: `1` claims an auction, `2` settles one.
     * @dev Nothing is read from `metadata`. `report` is `abi.encode(uint8 action, bytes payload)`;
     * the claim payload is `abi.encode(bytes32 auctionId)` and the settlement payload is
     * `abi.encode(Settlement)`.
     */
    function onReport(bytes calldata, bytes calldata report) external override onlyForwarder {
        (uint8 action, bytes memory payload) = abi.decode(report, (uint8, bytes));
        if (action == ACTION_CLAIM) {
            _startSettling(abi.decode(payload, (bytes32)));
        } else if (action == ACTION_SETTLE) {
            _settle(abi.decode(payload, (Settlement)));
        } else {
            revert UnknownReportAction();
        }
    }

    /**
     * @notice Refunds the locked USDC and every stake once `finalizeDeadline` has passed with no
     * settlement. Anyone may call it. A liveness fallback, and only that.
     * @dev Any live state refunds, `Created` included. Without it the USDC of an auction nobody bid
     * on is stuck forever.
     */
    function timeoutRefund(bytes32 auctionId) external {
        Auction storage auction = auctions[auctionId];
        if (auction.state == State.None || auction.state == State.Finalized || auction.state == State.Timeout) {
            revert BadState();
        }
        if (block.timestamp < auction.finalizeDeadline) {
            revert TooEarly();
        }

        auction.state = State.Timeout;
        _closeAuction(auctionId);

        usdc.safeTransfer(auction.buyer, auction.payoutCap);
        _refundStakes(auctionId);

        emit AuctionTimedOut(auctionId);
    }

    /**
     * @notice One auction the workflow can score now: it is in `Bidding` and its `bidDeadline` has
     * passed. `bytes32(0)` when there is none. The cron reads this and nothing else.
     * @dev The walk is over the open auctions, which `MAX_OPEN_AUCTIONS` caps and every terminal
     * transition shortens.
     */
    function pendingSettlement() external view returns (bytes32) {
        for (uint256 i = 0; i < _openAuctions.length; i++) {
            Auction storage candidate = auctions[_openAuctions[i]];
            if (candidate.state == State.Bidding && block.timestamp >= candidate.bidDeadline) {
                return _openAuctions[i];
            }
        }
        return bytes32(0);
    }

    /**
     * @notice Every bid commitment placed on an auction, in arrival order.
     * @dev The mapping is internal because a generated array getter reads one element and reports
     * no length, and the workflow needs the whole array to rebuild the bids root.
     */
    function commitments(bytes32 auctionId) external view returns (bytes32[] memory) {
        return _commitments[auctionId];
    }

    /// @notice Every supplier that committed to an auction, in the same order as `commitments`.
    function committers(bytes32 auctionId) external view returns (address[] memory) {
        return _committers[auctionId];
    }

    /// @notice Whether one supplier already committed to an auction.
    function hasCommitted(bytes32 auctionId, address supplier) external view returns (bool) {
        return _hasCommitted[auctionId][supplier];
    }

    /**
     * @notice The bid commitment one supplier placed, or `bytes32(0)` when it never committed.
     * @dev A linear walk over at most `MAX_BIDS` entries, so no second mapping is stored.
     */
    function commitmentOf(bytes32 auctionId, address supplier) external view returns (bytes32) {
        address[] storage stakers = _committers[auctionId];
        for (uint256 i = 0; i < stakers.length; i++) {
            if (stakers[i] == supplier) {
                return _commitments[auctionId][i];
            }
        }
        return bytes32(0);
    }

    /**
     * @notice Whether this contract answers to an interface. The forwarder probes it before every
     * report and delivers nothing to a receiver that claims `0xffffffff`.
     * @dev A rejected delivery is silent: the forwarder emits a failed result while the workflow
     * still reads a successful transaction, and the auction sits in `Settling` until the timeout.
     */
    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(IERC165).interfaceId || interfaceId == type(IReceiver).interfaceId;
    }

    /**
     * @notice The bids root the enclave builds, recomputed here. One byte of difference rejects a
     * correct settlement, so the construction is exact: every commitment for the auction, in
     * arrival order, hashed with `abi.encodePacked`.
     */
    function bidsRoot(bytes32 auctionId) public view returns (bytes32) {
        bytes32[] storage stored = _commitments[auctionId];
        if (stored.length == 0) {
            return bytes32(0);
        }
        return keccak256(abi.encodePacked(stored));
    }

    /**
     * @notice Claims the auction for the workflow, so that a stalled run can be told from a run
     * whose settlement was rejected.
     */
    function _startSettling(bytes32 auctionId) internal {
        Auction storage auction = auctions[auctionId];
        if (auction.state != State.Bidding) {
            revert BadState();
        }
        if (block.timestamp < auction.bidDeadline) {
            revert BiddingNotClosed();
        }

        auction.state = State.Settling;

        emit AuctionClaimed(auctionId);
    }

    /// @notice Pays the winner, refunds the buyer and refunds the losing stakes.
    function _settle(Settlement memory settlement) internal {
        Auction storage auction = auctions[settlement.auctionId];
        if (auction.state != State.Settling) {
            revert BadState();
        }
        if (settlement.policyHash != auction.policyHash) {
            revert PolicyHashMismatch();
        }
        if (settlement.bidsRoot != bidsRoot(settlement.auctionId)) {
            revert BidsRootMismatch();
        }
        if (settlement.payout > auction.payoutCap) {
            revert PayoutAboveCap();
        }
        if (settlement.winner == address(0)) {
            if (settlement.payout != 0) {
                revert PayoutWithoutWinner();
            }
        } else if (!_hasCommitted[settlement.auctionId][settlement.winner]) {
            revert WinnerNeverCommitted();
        } else if (settlement.payout == 0) {
            // The payout is the winning bid's price, and no bid asks zero. A settlement that names
            // a winner and pays it nothing is therefore a bug upstream.
            revert WinnerWithoutPayout();
        } else if (bytes(settlement.bookingId).length == 0) {
            revert MissingBookingId();
        }

        auction.state = State.Finalized;
        auction.winner = settlement.winner;
        auction.payout = settlement.payout;
        _closeAuction(settlement.auctionId);

        if (settlement.winner != address(0)) {
            usdc.safeTransfer(settlement.winner, settlement.payout);
        }
        usdc.safeTransfer(auction.buyer, auction.payoutCap - settlement.payout);
        _refundStakes(settlement.auctionId);

        emit AuctionFinalized(settlement.auctionId, settlement.winner, settlement.payout, settlement.bookingId);
    }

    /// Drops a terminal auction from the open list, so the scan only ever walks live ones.
    function _closeAuction(bytes32 auctionId) internal {
        uint256 openCount = _openAuctions.length;
        for (uint256 i = 0; i < openCount; i++) {
            if (_openAuctions[i] == auctionId) {
                _openAuctions[i] = _openAuctions[openCount - 1];
                _openAuctions.pop();
                return;
            }
        }
    }

    /// Every stake comes back, the winner's included: the stake binds a commitment, it pays nothing.
    function _refundStakes(bytes32 auctionId) internal {
        address[] storage stakers = _committers[auctionId];
        for (uint256 i = 0; i < stakers.length; i++) {
            usdc.safeTransfer(stakers[i], SUPPLIER_STAKE);
        }
    }
}
