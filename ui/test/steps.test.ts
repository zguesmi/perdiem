import assert from "node:assert/strict";
import { test } from "node:test";

import type { AuctionState, AuctionView } from "../src/auction.ts";
import { countdown, steps } from "../src/steps.ts";

const NOW = 1_800_000_000;

function auction(state: AuctionState, overrides: Partial<AuctionView> = {}): AuctionView {
  return {
    auctionId: "0x01",
    state,
    buyer: "0x0000000000000000000000000000000000000b17",
    policyHash: "0x02",
    payoutCap: 750_000_000n,
    bidDeadline: NOW + 90,
    finalizeDeadline: NOW + 3_690,
    createdTransaction: "0x03",
    bidsRoot: "0x04",
    bids: [],
    relayReachable: true,
    ...overrides,
  };
}

test("the live step is the auction's own state, and every earlier step is done", () => {
  const statuses = steps(auction("Bidding"), NOW).map((step) => step.status);
  assert.deepEqual(statuses, ["done", "live", "pending", "pending"]);
});

test("a terminal auction leaves no step live", () => {
  const finalized = steps(auction("Finalized"), NOW).map((step) => step.status);
  assert.deepEqual(finalized, ["done", "done", "done", "done"]);

  const timedOut = steps(auction("Timeout"), NOW).map((step) => step.status);
  assert.ok(!timedOut.includes("live"));
});

test("a timed-out auction leaves the steps it never reached pending", () => {
  const fromCreated = steps(auction("Timeout"), NOW);
  assert.deepEqual(
    fromCreated.map((step) => step.status),
    ["done", "pending", "pending", "done"],
  );
  assert.equal(fromCreated[2]?.line, "Never claimed");

  const fromBidding = auction("Timeout", { bids: [{ commitment: "0x05" }] });
  assert.deepEqual(
    steps(fromBidding, NOW).map((step) => step.status),
    ["done", "done", "pending", "done"],
  );
});

test("the bid countdown shows before the first commit opens bidding", () => {
  assert.equal(steps(auction("Created"), NOW)[1]?.line, "0 suppliers committed, 1:30 left");
});

test("timeout replaces the last step rather than adding a fifth", () => {
  const timedOut = steps(auction("Timeout"), NOW);
  assert.equal(timedOut.length, 4);
  assert.equal(timedOut[3]?.name, "Timeout");
  assert.equal(timedOut[3]?.line, "750 USDC and every stake refunded");
});

test("the live bidding step counts the commitments and the time left", () => {
  const bidding = auction("Bidding", {
    bids: [{ commitment: "0x05" }, { commitment: "0x06" }, { commitment: "0x07" }],
  });
  assert.equal(steps(bidding, NOW)[1]?.line, "3 suppliers committed, 1:30 left");
});

test("a step that has nothing to report still says what it waits for", () => {
  const lines = steps(auction("Created"), NOW).map((step) => step.line);
  assert.deepEqual(lines, [
    "750 USDC locked in escrow",
    "0 suppliers committed, 1:30 left",
    "Claimed once bidding closes",
    "Paid against the policy hash",
  ]);
});

test("a finalized auction names the winner and the payout", () => {
  const finalized = auction("Finalized", {
    settlement: {
      winner: "0x00000000000000000000000000000000000000c3",
      payout: 440_000_000n,
      bookingId: "abc",
      finalizedTransaction: "0x08",
    },
  });
  assert.equal(steps(finalized, NOW)[3]?.line, "0x00000000…0000c3 paid 440 USDC");
});

test("a finalized auction with no winner says so", () => {
  const empty = auction("Finalized", {
    settlement: {
      winner: "0x0000000000000000000000000000000000000000",
      payout: 0n,
      bookingId: "",
      finalizedTransaction: "0x08",
    },
  });
  assert.equal(steps(empty, NOW)[3]?.line, "No eligible bid");
});

test("the countdown holds at zero rather than going past it", () => {
  assert.equal(countdown(NOW - 60, NOW), "0:00");
  assert.equal(countdown(NOW + 9, NOW), "0:09");
  assert.equal(countdown(NOW + 605, NOW), "10:05");
  assert.equal(countdown(NOW + 7_325, NOW), "2:02:05");
});
