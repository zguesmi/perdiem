import { test } from "node:test";
import assert from "node:assert/strict";

import { policyHash, type Policy } from "@perdiem/core";

import { createRequisitionApp } from "../src/app.ts";

// The two beats of the demo, stated as tests. Red until the routes are implemented, and blocked on
// docs/scratch/build/01-policy-schema-and-scoring-formula.md for the exact Policy shape.

const intent =
  "Paris, 12 to 14 October, one double room, 4 star minimum, within 2 km of Gare du Nord. " +
  "Free cancellation is worth 50. Breakfast is worth 40. I would accept 3 star if at least 30% cheaper.";

test("turns one sentence into a policy", async () => {
  const response = await createRequisitionApp().request("/intent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ intent }),
  });

  assert.equal(response.status, 200);

  const body = (await response.json()) as { policy?: unknown };
  assert.ok(body.policy, "the response carries the parsed policy");
});

test("rejects an intent the model could not turn into a valid policy", async () => {
  const response = await createRequisitionApp().request("/intent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ intent: "" }),
  });

  assert.equal(response.status, 422);
});

test("hashes the confirmed policy the same way every other package does", async () => {
  // The Policy from docs/spec.md. The placeholder that stood here no longer satisfies the schema
  // that packages/core now enforces, and an invalid Policy would fail before it was ever hashed.
  const policy: Policy = {
    version: 1,
    currency: "USDC",
    maxPrice: 520_000_000,
    nights: 2,
    hardRequirements: {
      city: "Paris",
      checkin: "2026-10-12",
      checkout: "2026-10-14",
      minStars: 4,
      roomType: "double",
      numberOfRooms: 1,
      location: { name: "Gare du Nord", latitudeMicro: 48_880_900, longitudeMicro: 2_355_300 },
      radiusMeters: 2000,
    },
    tradeDown: { stars: 3, requiredDiscountPercentage: 30 },
    preferences: { refundable: 50_000_000, breakfastIncluded: 40_000_000 },
  };

  const response = await createRequisitionApp().request("/confirm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ policy }),
  });

  assert.equal(response.status, 200);

  const body = (await response.json()) as { policyHash?: string };
  assert.equal(body.policyHash, policyHash(policy));
});
