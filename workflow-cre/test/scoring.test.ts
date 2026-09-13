import { test } from "node:test";
import assert from "node:assert/strict";
import { referencePolicy } from "../../shared/reference-policy.ts";

import { settle, type ScorableBid } from "../src/scoring.ts";

// The same three bids scored twice. The buyer's policy is the only thing that differs between the
// two runs, and it moves the payout from the dearest bid to the cheapest one. If either of these
// ever picks another winner, the two stories the page tells are gone.

const policy = referencePolicy;

const bids: ScorableBid[] = [
  {
    supplier: "0xa",
    stars: 3,
    price: 2_000_000,
    refundable: true,
    breakfastIncluded: false,
  },
  {
    supplier: "0xb",
    stars: 4,
    price: 4_000_000,
    refundable: false,
    breakfastIncluded: false,
  },
  {
    supplier: "0xc",
    stars: 4,
    price: 6_000_000,
    refundable: true,
    breakfastIncluded: true,
  },
];

test("the dearest bid wins because the buyer's preferences are worth more than the price gap", () => {
  // 4.00 with nothing scores 2.00. 6.00 with both preferences scores 0 + 2 + 1 = 3.00.
  const settlement = settle(policy, bids);

  assert.equal(settlement.winner, "0xc");
  assert.equal(settlement.payout, 6_000_000);
});

test("the cheapest bid is ineligible because the trade-down discount is not deep enough", () => {
  // 2.00 is 50% below the cheapest four-star bid. The policy asks for 60%.
  const settlement = settle(policy, bids);

  assert.notEqual(settlement.winner, "0xa");
});

test("the cheapest bid wins when the buyer asks for a shallower trade-down discount", () => {
  // The same three bids against a policy that takes three stars at 40% off: 2.00 is 50% below the
  // cheapest four-star bid, so it is Eligible, and it scores 4 + 2 = 6.00.
  const shallower = {
    ...policy,
    tradeDown: { ...policy.tradeDown, requiredDiscountPercentage: 40 },
  };

  const settlement = settle(shallower, bids);

  assert.equal(settlement.winner, "0xa");
  assert.equal(settlement.payout, 2_000_000);
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
  assert.equal(settlement.payout, 2_000_000);
});

test("a trade-down bid deep enough below the cheapest bid at the star rating is eligible", () => {
  // 1.60 is 60% below 4.00, which is exactly what the policy asks for.
  const deepDiscount = { ...bids[0]!, price: 1_600_000 };

  const settlement = settle(policy, [deepDiscount, bids[1]!]);

  assert.equal(settlement.winner, "0xa");
  assert.equal(settlement.payout, 1_600_000);
});

test("equal scores break on the lower price", () => {
  // 4.00 with breakfast and 3.00 with nothing both score 3.00.
  const dearer: ScorableBid = {
    ...bids[1]!,
    supplier: "0xd",
    price: 4_000_000,
    breakfastIncluded: true,
  };
  const cheaper: ScorableBid = { ...bids[1]!, supplier: "0xe", price: 3_000_000 };

  const settlement = settle(policy, [dearer, cheaper]);

  assert.equal(settlement.winner, "0xe");
  assert.equal(settlement.payout, 3_000_000);
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
