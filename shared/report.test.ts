import { test } from "node:test";
import assert from "node:assert/strict";

import { decodeAbiParameters, keccak256, parseAbiParameters, toHex } from "viem";

import {
  ACTION_CLAIM,
  ACTION_SETTLE,
  encodeClaimReport,
  encodeSettlementReport,
  type Settlement,
} from "./report.ts";

/**
 * The same three report bodies are pinned in `onchain/test/SealedAuction.t.sol`, which decodes them
 * with the Solidity struct. Either side moving alone fails one of the two suites.
 */

const AUCTION_ID = keccak256(toHex("the auction"));
const POLICY_HASH = keccak256(toHex("the policy"));
const BIDS_ROOT = "0xffdbd9c1b65b61303d9298cfb6afcb3114a6ec8400b2280b102f32a581913b7f" as const;

const settlement: Settlement = {
  auctionId: AUCTION_ID,
  winner: "0x00000000000000000000000000000000000000A3",
  payout: 440_000_000,
  policyHash: POLICY_HASH,
  bidsRoot: BIDS_ROOT,
  bookingId: "lp-booking-1",
};

const CLAIM_REPORT =
  "0x0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000204a6f6558ddbe534c870896c026435a848d633bcddadbb5ffdc7c84ba111a3827";

const SETTLEMENT_REPORT =
  "0x00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000012000000000000000000000000000000000000000000000000000000000000000204a6f6558ddbe534c870896c026435a848d633bcddadbb5ffdc7c84ba111a382700000000000000000000000000000000000000000000000000000000000000a3000000000000000000000000000000000000000000000000000000001a39de003d6505bc416908666b6dde75e609ac6fa0f6231177936c6027c9f5320a390993ffdbd9c1b65b61303d9298cfb6afcb3114a6ec8400b2280b102f32a581913b7f00000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000000c6c702d626f6f6b696e672d310000000000000000000000000000000000000000";

const NO_WINNER_REPORT =
  "0x00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000204a6f6558ddbe534c870896c026435a848d633bcddadbb5ffdc7c84ba111a3827000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003d6505bc416908666b6dde75e609ac6fa0f6231177936c6027c9f5320a390993ffdbd9c1b65b61303d9298cfb6afcb3114a6ec8400b2280b102f32a581913b7f00000000000000000000000000000000000000000000000000000000000000c00000000000000000000000000000000000000000000000000000000000000000";

test("encodes the claim report the receiver decodes", () => {
  assert.equal(encodeClaimReport(AUCTION_ID), CLAIM_REPORT);
});

test("encodes the settlement report the receiver decodes", () => {
  assert.equal(encodeSettlementReport(settlement), SETTLEMENT_REPORT);
});

/// An empty `bookingId` is the no-winner path, and a dynamic member is where two encoders drift.
test("encodes a settlement with no winner and no booking id", () => {
  const noWinner: Settlement = {
    ...settlement,
    winner: "0x0000000000000000000000000000000000000000",
    payout: 0,
    bookingId: "",
  };

  assert.equal(encodeSettlementReport(noWinner), NO_WINNER_REPORT);
});

/// Scoring reports `null` for no winner, and the wire spells it as the zero address.
test("encodes a null winner as the zero address", () => {
  const noWinner: Settlement = {
    ...settlement,
    winner: null,
    payout: 0,
    bookingId: "",
  };

  assert.equal(encodeSettlementReport(noWinner), NO_WINNER_REPORT);
});

test("prefixes each report with its own action", () => {
  const [claimAction] = decodeAbiParameters(parseAbiParameters("uint8, bytes"), CLAIM_REPORT);
  const [settleAction] = decodeAbiParameters(parseAbiParameters("uint8, bytes"), SETTLEMENT_REPORT);

  assert.equal(claimAction, ACTION_CLAIM);
  assert.equal(settleAction, ACTION_SETTLE);
});
