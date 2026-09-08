// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

/// @title BidHash
/// @notice The EIP-712 struct hash of a Bid, and the Bid Commitment built from it.
/// @dev    Separate from `SealedAuction` on purpose: the auction stores commitments and never sees
///         a Bid. This contract exists so that a test can prove the supplier agents, which build
///         and sign bids in TypeScript, and the chain agree byte for byte.
///
///         The signing hash has no Solidity side. Nothing on chain verifies a bid signature; the
///         Enclave does, after it decrypts the Sealed Bid.
contract BidHash {
    /// @notice One supplier's priced offer. The member order is the EIP-712 type order and changing
    ///         it changes every hash below.
    /// @dev    The salt is not a member. It stays outside the struct hash so a signature can be
    ///         checked without it, and so the commitment cannot be brute-forced with it.
    struct Bid {
        bytes32 auctionId;
        address supplier;
        string hotelId;
        string hotelName;
        uint8 stars;
        uint32 distanceMeters;
        uint256 price;
        bool refundable;
        bool breakfastIncluded;
        string roomType;
        uint8 numberOfRooms;
    }

    /// @notice keccak256 of the EIP-712 type string, written out exactly as `docs/spec.md` states.
    bytes32 public constant BID_TYPE_HASH = keccak256(
        "Bid(bytes32 auctionId,address supplier,string hotelId,string hotelName,uint8 stars,uint32 distanceMeters,uint256 price,bool refundable,bool breakfastIncluded,string roomType,uint8 numberOfRooms)"
    );

    /// @notice The EIP-712 `hashStruct` of a Bid: no salt, no domain.
    /// @dev    Dynamic members are hashed, value members are left-padded to 32 bytes. That is what
    ///         `abi.encode` does here, and it is why `abi.encodePacked` would be wrong.
    function hashBid(Bid calldata bid) external pure returns (bytes32) {
        return keccak256(
            abi.encode(
                BID_TYPE_HASH,
                bid.auctionId,
                bid.supplier,
                keccak256(bytes(bid.hotelId)),
                keccak256(bytes(bid.hotelName)),
                bid.stars,
                bid.distanceMeters,
                bid.price,
                bid.refundable,
                bid.breakfastIncluded,
                keccak256(bytes(bid.roomType)),
                bid.numberOfRooms
            )
        );
    }

    /// @notice The Bid Commitment a supplier places on chain with its Stake.
    /// @param bidHash The EIP-712 struct hash of the Bid being committed.
    /// @param salt    The 32 bytes that keep the small bid space out of reach of a brute force.
    function commitmentOf(bytes32 bidHash, bytes32 salt) external pure returns (bytes32) {
        return keccak256(abi.encode(bidHash, salt));
    }
}
