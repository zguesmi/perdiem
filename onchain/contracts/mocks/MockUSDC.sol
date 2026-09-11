// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @notice A six-decimal ERC-20 that stands in for Arc's USDC on a local node and in the tests. The
 *         decimal count matters: every figure in this repository is written in minor units.
 * @dev    Local scaffolding. Arc has a real USDC, so nothing deployed there ever uses this, and
 *         `SealedAuction` must not import it.
 */
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {}

    function mint(address to, uint256 value) external {
        _mint(to, value);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}
