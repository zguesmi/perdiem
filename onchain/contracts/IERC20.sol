// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

/// @title IERC20
/// @notice The two ERC-20 calls the escrow makes. Arc's USDC is a native token with an ERC-20
///         interface at `0x3600000000000000000000000000000000000000` and 6 decimals, per row V5 of
///         `docs/decisions.md`.
/// @dev    Declared here rather than imported from `forge-std`, which is a development dependency
///         and must not appear in the production call graph.
interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);

    function transferFrom(address from, address to, uint256 value) external returns (bool);
}
