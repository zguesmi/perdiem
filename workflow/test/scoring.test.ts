import { test } from "node:test";
import assert from "node:assert/strict";
import { goldenPolicy } from "../../shared/golden-policy.ts";

import { settle, type Bid } from "../src/scoring.ts";

// The demo table, straight from the specification. Three bids arrive, the cheapest one loses, and
// the second cheapest wins because the buyer's private preferences are worth more than the
// difference in price. If this test ever goes green for a different winner, the demo is dead.
//
// Red until settle is implemented. That is ticket 06.

const policy = goldenPolicy;

const bids: Bid[] = [
  {
    supplier: "0xa",
    hotelId: "hotel-a",
    stars: 3,
    distanceMeters: 500,
    price: 330_000_000,
    refundable: true,
    breakfastIncluded: false,
    roomType: "double",
    numberOfRooms: 1,
  },
  {
    supplier: "0xb",
    hotelId: "hotel-b",
    stars: 4,
    distanceMeters: 700,
    price: 400_000_000,
    refundable: false,
    breakfastIncluded: false,
    roomType: "double",
    numberOfRooms: 1,
  },
  {
    supplier: "0xc",
    hotelId: "hotel-c",
    stars: 4,
    distanceMeters: 1000,
    price: 440_000_000,
    refundable: true,
    breakfastIncluded: true,
    roomType: "double",
    numberOfRooms: 1,
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

test("a bid outside the radius is ineligible", () => {
  const tooFar = bids.map((bid) => ({
    ...bid,
    distanceMeters: policy.hardRequirements.radiusMeters + 1,
  }));

  const settlement = settle(policy, tooFar);

  assert.equal(settlement.winner, null);
  assert.equal(settlement.payout, 0);
});
