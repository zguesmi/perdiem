import assert from "node:assert/strict";
import { test } from "node:test";

import type { AuctionState, AuctionView } from "../src/auction.ts";
import {
  countdown,
  follow,
  lastLine,
  steps,
  type Item,
  type StepKey,
  type Step,
} from "../src/steps.ts";

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
    createdTransaction: { hash: "0x03", blockNumber: 10n },
    bidsRoot: "0x04",
    bids: [],
    relayReachable: true,
    balances: new Map(),
    ...overrides,
  };
}

function walk(state: AuctionState, overrides: Partial<AuctionView> = {}): Step[] {
  return steps(auction(state, overrides), { now: NOW });
}

function reached(state: AuctionState, overrides: Partial<AuctionView> = {}): StepKey[] {
  return walk(state, overrides)
    .filter((step) => step.reached)
    .map((step) => step.key);
}

function rows(step: Step): [string, string][] {
  return step.items.flatMap((item: Item) =>
    item.kind === "row" && item.value.kind === "text"
      ? [[item.label, item.value.text] as [string, string]]
      : [],
  );
}

test("every state shows all five steps, timeout included", () => {
  for (const state of ["Created", "Bidding", "Settling", "Finalized", "Timeout"] as const) {
    assert.deepEqual(
      walk(state).map((step) => step.key),
      ["created", "bidding", "settling", "finalized", "timeout"],
    );
  }
});

test("an auction reaches every step up to its own state, and never timeout", () => {
  assert.deepEqual(reached("Created"), ["created"]);
  assert.deepEqual(reached("Bidding"), ["created", "bidding"]);
  assert.deepEqual(reached("Settling"), ["created", "bidding", "settling"]);
  assert.deepEqual(reached("Finalized"), ["created", "bidding", "settling", "finalized"]);
});

test("the running step is live, and a finalized auction leaves none", () => {
  assert.deepEqual(
    walk("Bidding").map((step) => step.status),
    ["done", "live", "pending", "pending", "pending"],
  );
  assert.ok(!walk("Finalized").some((step) => step.status === "live"));
});

test("a timed-out auction leaves the steps it never reached unreached", () => {
  assert.deepEqual(reached("Timeout"), ["created", "timeout"]);
  assert.deepEqual(reached("Timeout", { bids: [{ commitment: "0x05" }] }), [
    "created",
    "bidding",
    "timeout",
  ]);
  assert.deepEqual(
    reached("Timeout", {
      bids: [{ commitment: "0x05" }],
      claimedTransaction: { hash: "0x06", blockNumber: 12n },
    }),
    ["created", "bidding", "settling", "timeout"],
  );
});

test("a refunded auction never reaches finalized, and timeout wears the refund", () => {
  const timedOut = walk("Timeout");
  assert.equal(timedOut[3]?.status, "skipped");
  assert.equal(timedOut[4]?.status, "refunded");
  assert.equal(timedOut[4]?.headline, "No settlement arrived in time. Everything is refunded.");
  assert.deepEqual(rows(timedOut[4] as Step), [["Refunded to the travel desk", "750 USDC"]]);
});

test("the bid countdown is a row on whichever of the first two steps is running", () => {
  assert.deepEqual(rows(walk("Created")[0] as Step).at(-1), ["Bidding closes in", "1:30"]);

  const bidding = walk("Bidding", { bids: [{ commitment: "0x05" }] });
  assert.deepEqual(rows(bidding[1] as Step).at(-1), ["Bidding closes in", "1:30"]);
  assert.ok(!rows(bidding[0] as Step).some(([label]) => label === "Bidding closes in"));
});

test("the settling step counts down to the refund while it is running", () => {
  assert.deepEqual(rows(walk("Settling")[2] as Step), [["Refunds open in", "1:01:30"]]);
});

test("the bidding headline counts the suppliers that staked", () => {
  assert.equal(
    walk("Bidding", { bids: [{ commitment: "0x05" }] })[1]?.headline,
    "1 supplier staked and sealed a bid.",
  );
  assert.equal(
    walk("Bidding", { bids: [{ commitment: "0x05" }, { commitment: "0x06" }] })[1]?.headline,
    "2 suppliers staked and sealed a bid.",
  );
});

test("a finalized auction names the winner, the refund and the booking", () => {
  const finalized = walk("Finalized", {
    bids: [{ commitment: "0x05" }],
    settlement: {
      winner: "0x00000000000000000000000000000000000000c3",
      payout: 440_000_000n,
      bookingId: "abc",
      finalizedTransaction: { hash: "0x08", blockNumber: 14n },
    },
  })[3] as Step;

  assert.equal(finalized.headline, "The winning bid is paid and the room is booked.");
  assert.deepEqual(
    finalized.items.filter((item) => item.kind === "bid"),
    [{ kind: "bid", address: "0x00000000…0000c3", tag: "winner", win: true, note: "paid 440 USDC" }],
  );
  assert.deepEqual(rows(finalized), [
    ["Refunded to the travel desk", "310 USDC"],
    ["Stakes", "1 returned"],
    ["Hotel", "Reading the booking…"],
  ]);
});

test("a finalized auction with no winner refunds the cap in full", () => {
  const empty = walk("Finalized", {
    settlement: {
      winner: "0x0000000000000000000000000000000000000000",
      payout: 0n,
      bookingId: "",
      finalizedTransaction: { hash: "0x08", blockNumber: 14n },
    },
  })[3] as Step;

  assert.equal(empty.headline, "No bid qualified. The escrow is refunded in full.");
  assert.ok(!empty.items.some((item) => item.kind === "bid"));
  assert.deepEqual(rows(empty), [["Refunded to the travel desk", "750 USDC"]]);
});

test("the hotel is linked once the booking has been read", () => {
  const finalized = steps(
    auction("Finalized", {
      settlement: {
        winner: "0x00000000000000000000000000000000000000c3",
        payout: 440_000_000n,
        bookingId: "abc",
        finalizedTransaction: { hash: "0x08", blockNumber: 14n },
      },
    }),
    { now: NOW, booking: { hotelId: "lp1a2b3", hotelName: "Hôtel Malte Opera" } },
  )[3] as Step;

  assert.deepEqual(
    finalized.items.flatMap((item) =>
      item.kind === "row" && item.value.kind === "link" ? [[item.label, item.value.href]] : [],
    ),
    [
      ["Hotel", "/hotel?hotelId=lp1a2b3"],
      ["Booking", "/booking/abc"],
    ],
  );
});

test("a load that finds a finished auction collapses it", () => {
  for (const state of ["Finalized", "Timeout"] as const) {
    assert.deepEqual(follow({ expanded: true }, auction(state)), {
      auctionId: "0x01",
      expanded: false,
    });
  }
});

test("an auction that finishes while the page is open stays open", () => {
  const open = follow({ expanded: true }, auction("Bidding"));
  assert.deepEqual(open, { auctionId: "0x01", expanded: true });
  // The same auction, two polls later, terminal. The decision was taken when it was first seen.
  assert.equal(follow(open, auction("Finalized")), open);
});

test("the next auction is followed again, whatever the reader did with the last one", () => {
  const hidden = { auctionId: "0x01", expanded: false };
  assert.deepEqual(follow(hidden, auction("Created", { auctionId: "0x09" })), {
    auctionId: "0x09",
    expanded: true,
  });
});

test("a collapsed auction leaves one line naming what it booked, or what came back", () => {
  assert.deepEqual(lastLine(auction("Timeout")), {
    label: "Last auction",
    line: "Refunded in full. 750 USDC returned to the travel desk.",
  });

  const finalized = auction("Finalized", {
    settlement: {
      winner: "0x00000000000000000000000000000000000000c3",
      payout: 440_000_000n,
      bookingId: "abc",
      finalizedTransaction: { hash: "0x08", blockNumber: 14n },
    },
  });
  assert.deepEqual(lastLine(finalized), { label: "Last booking", line: "abc · 440 USDC" });
  assert.deepEqual(lastLine(finalized, { hotelId: "lp1a2b3", hotelName: "Hôtel Malte Opera" }), {
    label: "Last booking",
    line: "Hôtel Malte Opera · 440 USDC",
  });
});

test("the countdown holds at zero rather than going past it", () => {
  assert.equal(countdown(NOW - 60, NOW), "0:00");
  assert.equal(countdown(NOW + 9, NOW), "0:09");
  assert.equal(countdown(NOW + 605, NOW), "10:05");
  assert.equal(countdown(NOW + 7_325, NOW), "2:02:05");
});

test("the timeout step carries the time left, until the auction is terminal", () => {
  function note(state: AuctionState): string | undefined {
    return walk(state).find((step) => step.key === "timeout")?.note;
  }

  assert.equal(note("Created"), "(1:01:30)");
  assert.equal(note("Bidding"), "(1:01:30)");
  assert.equal(note("Settling"), "(1:01:30)");
  assert.equal(note("Finalized"), undefined);
  assert.equal(note("Timeout"), undefined);
});

test("no step but timeout carries a note", () => {
  assert.deepEqual(
    walk("Bidding")
      .filter((step) => step.note !== undefined)
      .map((step) => step.key),
    ["timeout"],
  );
});
