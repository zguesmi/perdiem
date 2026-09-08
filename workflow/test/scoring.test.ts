import { test } from "node:test";
import assert from "node:assert/strict";

import { settle, type Bid } from "../src/scoring.ts";

// The demo table, straight from the specification. Three bids arrive, the cheapest one loses, and
// the second cheapest wins because the buyer's private preferences are worth more than the
// difference in price. If this test ever goes green for a different winner, the demo is dead.
//
// Red until settle is implemented. The Policy shape is blocked on
// .scratch/build/01-policy-schema-and-scoring-formula.md.

const policy = {
  maxPrice: 520,
  nights: 2,
  hardRequirements: {
    city: "Paris",
    checkin: "2026-10-12",
    checkout: "2026-10-14",
    minStars: 4,
    roomType: "double",
    numberOfRooms: 1,
    radiusKm: 2,
  },
  tradeDown: { stars: 3, requiredDiscountPercentage: 30 },
  preferences: { refundable: 50, breakfastIncluded: 40 },
};

const bids: Bid[] = [
  {
    supplier: "0xa",
    hotelId: "hotel-a",
    stars: 3,
    distanceKm: 0.5,
    price: 330,
    refundable: true,
    breakfastIncluded: false,
    roomType: "double",
    numberOfRooms: 1,
  },
  {
    supplier: "0xb",
    hotelId: "hotel-b",
    stars: 4,
    distanceKm: 0.7,
    price: 400,
    refundable: false,
    breakfastIncluded: false,
    roomType: "double",
    numberOfRooms: 1,
  },
  {
    supplier: "0xc",
    hotelId: "hotel-c",
    stars: 4,
    distanceKm: 1.0,
    price: 440,
    refundable: true,
    breakfastIncluded: true,
    roomType: "double",
    numberOfRooms: 1,
  },
];

test("the second cheapest bid wins", () => {
  const settlement = settle(policy, bids);

  assert.equal(settlement.winner, "0xc");
  assert.equal(settlement.payout, 440);
});

test("the cheapest bid is ineligible because the trade-down discount is not deep enough", () => {
  // 330 is 17.5% below the cheapest four-star bid. The policy asks for 30%.
  const settlement = settle(policy, bids);

  assert.notEqual(settlement.winner, "0xa");
});

test("no eligible bid means no winner and no payout", () => {
  const overpriced = bids.map((bid) => ({ ...bid, price: 999 }));

  const settlement = settle(policy, overpriced);

  assert.equal(settlement.winner, null);
  assert.equal(settlement.payout, 0);
});
