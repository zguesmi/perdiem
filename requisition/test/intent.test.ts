import { test } from "node:test";
import assert from "node:assert/strict";

import { policyHash } from "@perdiem/core";

import { createRequisitionApp } from "../src/app.ts";

// The two beats of the demo, stated as tests. Red until the routes are implemented, and blocked on
// docs/scratch/build/issues/01-policy-schema-and-scoring-formula.md for the exact Policy shape.

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
  const policy = { maxPrice: 520, nights: 2 };

  const response = await createRequisitionApp().request("/confirm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ policy }),
  });

  assert.equal(response.status, 200);

  const body = (await response.json()) as { policyHash?: string };
  assert.equal(body.policyHash, policyHash(policy));
});
