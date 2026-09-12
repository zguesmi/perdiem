import { test } from "node:test";
import assert from "node:assert/strict";
import { referencePolicy } from "../../shared/reference-policy.ts";

import { settle, type ScorableBid } from "../src/scoring.ts";

// The demo table, straight from the specification. Three bids arrive, the cheapest one loses, and
// the second cheapest wins because the buyer's private preferences are worth more than the
// difference in price. If this test ever goes green for a different winner, the demo is dead.

const policy = referencePolicy;

const bids: ScorableBid[] = [
  {
    supplier: "0xa",
    stars: 3,
    price: 330_000_000,
    refundable: true,
    breakfastIncluded: false,
  },
  {
    supplier: "0xb",
    stars: 4,
    price: 400_000_000,
    refundable: false,
    breakfastIncluded: false,
  },
  {
    supplier: "0xc",
    stars: 4,
    price: 440_000_000,
    refundable: true,
    breakfastIncluded: true,
  },
];

test("the second cheapest bid wins", () => {
  const settlement = settle(policy, bids);

  assert.equal(settlement.winner, "0xc");
  assert.equal(settlement.payout, 440_000_000);
});

test("the cheapest bid is ineligible because the trade-down discount is not deep enough", () => {
  // 330 is 17.5% below the cheapest four-star bid. The policy asks for 30%.
  const settlement = settle(policy, bids);

  assert.notEqual(settlement.winner, "0xa");
});

test("a bid over the maximum price is ineligible", () => {
  const overpriced = bids.map((bid) => ({ ...bid, price: policy.maxPrice + 1 }));

  const settlement = settle(policy, overpriced);

  assert.equal(settlement.winner, null);
  assert.equal(settlement.payout, 0);
});

test("a trade-down bid is eligible on the maximum price alone when no bid meets the star rating", () => {
  // Only the three-star bid survives, so there is no cheapest four-star bid to discount against.
  const settlement = settle(policy, [bids[0]!]);

  assert.equal(settlement.winner, "0xa");
  assert.equal(settlement.payout, 330_000_000);
});

test("a trade-down bid deep enough below the cheapest bid at the star rating is eligible", () => {
  // 280 is 30% below 400, which is exactly what the policy asks for.
  const deepDiscount = { ...bids[0]!, price: 280_000_000 };

  const settlement = settle(policy, [deepDiscount, bids[1]!]);

  assert.equal(settlement.winner, "0xa");
  assert.equal(settlement.payout, 280_000_000);
});

test("equal scores break on the lower price", () => {
  // 400 with breakfast and 360 with nothing both score 160.
  const dearer: ScorableBid = {
    ...bids[1]!,
    supplier: "0xd",
    price: 400_000_000,
    breakfastIncluded: true,
  };
  const cheaper: ScorableBid = { ...bids[1]!, supplier: "0xe", price: 360_000_000 };

  const settlement = settle(policy, [dearer, cheaper]);

  assert.equal(settlement.winner, "0xe");
  assert.equal(settlement.payout, 360_000_000);
});

test("equal scores at the same price break on the lower supplier address", () => {
  const first: ScorableBid = { ...bids[1]!, supplier: "0xB" };
  const second: ScorableBid = { ...bids[1]!, supplier: "0xa" };

  const settlement = settle(policy, [first, second]);

  assert.equal(settlement.winner, "0xa");
});

test("no bid at all means no winner", () => {
  const settlement = settle(policy, []);

  assert.equal(settlement.winner, null);
  assert.equal(settlement.payout, 0);
});
