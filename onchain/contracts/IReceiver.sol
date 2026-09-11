// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/**
 * What the CRE forwarder delivers a report to. It probes `supportsInterface` first and skips a
 * receiver that answers `true` to every identifier.
 */
interface IReceiver is IERC165 {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}
