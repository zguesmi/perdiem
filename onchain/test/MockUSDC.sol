// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @notice A six-decimal ERC-20 that stands in for Arc's USDC in the Solidity tests. The decimal
 *         count matters: every figure in the tests is written in minor units.
 * @dev    Test scaffolding. Nothing under `contracts/` may import it.
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
