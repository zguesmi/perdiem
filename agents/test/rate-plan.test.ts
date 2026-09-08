import { test } from "node:test";
import assert from "node:assert/strict";

import { DEMO_RATE_PLANS, priceFromRatePlan } from "../src/rate-plan.ts";

// The three prices the demo depends on, taken from the specification. Against a base rate of 400,
// the plans must produce 330, 400 and 440, or the demo stops showing what it claims to show.
// Red until priceFromRatePlan is implemented.

const BASE_PRICE = 400;

test("agent a underprices the market", () => {
  assert.equal(priceFromRatePlan(BASE_PRICE, DEMO_RATE_PLANS.a), 330);
});

test("agent b bids the market rate", () => {
  assert.equal(priceFromRatePlan(BASE_PRICE, DEMO_RATE_PLANS.b), 400);
});

test("agent c charges for what it includes", () => {
  assert.equal(priceFromRatePlan(BASE_PRICE, DEMO_RATE_PLANS.c), 440);
});

test("returns whole units, never a fraction", () => {
  const price = priceFromRatePlan(333, DEMO_RATE_PLANS.c);

  assert.equal(price, Math.trunc(price));
});
