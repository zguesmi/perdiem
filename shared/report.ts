import { encodeAbiParameters, parseAbiParameters } from "viem";

/**
 * What the enclave writes to `SealedAuction`. A workflow's one write RPC carries no calldata, so
 * both of its writes land on the same function and an action prefix tells them apart.
 *
 * The body is `abi.encode(uint8 action, bytes payload)`. The claim payload is
 * `abi.encode(bytes32 auctionId)` and the settlement payload is `abi.encode(Settlement)`, with the
 * members in the order the Solidity struct declares them. The receiver decodes both, so a member
 * reordered on either side has to be reordered on the other.
 */

export const ACTION_CLAIM = 1;
export const ACTION_SETTLE = 2;

/** The only thing that leaves the enclave. `payout` is USDC minor units, `bookingId` empty when there is no winner. */
export type Settlement = {
  auctionId: `0x${string}`;
  winner: `0x${string}`;
  payout: number;
  policyHash: `0x${string}`;
  bidsRoot: `0x${string}`;
  bookingId: string;
};

const REPORT_BODY = parseAbiParameters("uint8 action, bytes payload");
const CLAIM_PAYLOAD = parseAbiParameters("bytes32 auctionId");
const SETTLEMENT_PAYLOAD = parseAbiParameters(
  "(bytes32 auctionId, address winner, uint256 payout, bytes32 policyHash, bytes32 bidsRoot, string bookingId)",
);

/** Moves the auction to `Settling`, so a stalled run can be told from a rejected settlement. */
export function encodeClaimReport(auctionId: `0x${string}`): `0x${string}` {
  return encodeAbiParameters(REPORT_BODY, [
    ACTION_CLAIM,
    encodeAbiParameters(CLAIM_PAYLOAD, [auctionId]),
  ]);
}

export function encodeSettlementReport(settlement: Settlement): `0x${string}` {
  const payload = encodeAbiParameters(SETTLEMENT_PAYLOAD, [
    { ...settlement, payout: BigInt(settlement.payout) },
  ]);
  return encodeAbiParameters(REPORT_BODY, [ACTION_SETTLE, payload]);
}
