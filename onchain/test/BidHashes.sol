// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

/**
 * @notice The EIP-712 bid struct hash and the bid commitment, in Solidity, so that a divergence
 *         from the TypeScript in `shared/bid.ts` fails a test instead of dropping honest bids
 *         inside the enclave.
 * @dev    Test scaffolding. Nothing under `contracts/` may import it: the contract stores the
 *         commitment it is handed and never recomputes either hash.
 */
contract BidHashes {
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

    bytes32 internal constant BID_TYPEHASH = keccak256(
        "Bid(bytes32 auctionId,address supplier,string hotelId,string hotelName,uint8 stars,"
        "uint32 distanceMeters,uint256 price,bool refundable,bool breakfastIncluded,"
        "string roomType,uint8 numberOfRooms)"
    );

    /// @notice The EIP-712 `hashStruct`. No salt, no domain.
    function bidHash(Bid calldata bid) external pure returns (bytes32) {
        return keccak256(
            abi.encode(
                BID_TYPEHASH,
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

    /// @notice The bid commitment. The salt stays outside the struct hash and enters only here.
    function commitment(bytes32 hash, bytes32 salt) external pure returns (bytes32) {
        return keccak256(abi.encode(hash, salt));
    }
}
