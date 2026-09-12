import assert from "node:assert/strict";
import { test } from "node:test";

import { hashPolicy } from "../../shared/policy-hash.ts";
import { referencePolicy, makePolicy } from "../../shared/reference-policy.ts";
import { createPurchaserApp } from "../src/app.ts";
import type { Completer } from "../src/intent.ts";

const intent =
  "Paris, 12 to 14 October 2026, one double room, 4 star minimum, at most 520 USDC. " +
  "Free cancellation is worth 50. Breakfast is worth 40. I would accept 3 star if at least 30% cheaper.";

/** Answers with each candidate in turn, and records how many calls the service actually made. */
function stub(...candidates: unknown[]): Completer & { calls: () => number } {
  let calls = 0;
  const completer = async (): Promise<unknown> => candidates[calls++ % candidates.length];

  return Object.assign(completer, { calls: () => calls });
}

async function post(
  app: ReturnType<typeof createPurchaserApp>,
  path: string,
  body: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

test("turns one sentence into a policy", async () => {
  const completer = stub(referencePolicy);
  const response = await post(createPurchaserApp({ completer }), "/intent", { intent });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.policy, referencePolicy);
  assert.equal(completer.calls(), 1);
});

test("retries a candidate that fails the schema exactly once", async () => {
  const completer = stub(makePolicy({ hardRequirements: { minStars: 9 } }), referencePolicy);
  const response = await post(createPurchaserApp({ completer }), "/intent", { intent });

  assert.equal(response.status, 200);
  assert.equal(completer.calls(), 2);
});

test("gives up after the second failure, and hashes nothing", async () => {
  const completer = stub(makePolicy({ currency: "EUR" }));
  const response = await post(createPurchaserApp({ completer }), "/intent", { intent });

  assert.equal(response.status, 422);
  assert.equal(completer.calls(), 2);
  assert.equal(response.body.policy, undefined);
});

test("rejects a fractional price rather than rounding it", async () => {
  // Rounding would silently change the number the buyer is about to commit to on chain.
  const completer = stub(makePolicy({ maxPrice: 520_000_000.5 }));
  const response = await post(createPurchaserApp({ completer }), "/intent", { intent });

  assert.equal(response.status, 422);
});

test("tells the model today's date, so a month and a day resolve to a year", async () => {
  let seen = "";
  const completer: Completer = async (_intent, today) => {
    seen = today;
    return referencePolicy;
  };

  await post(createPurchaserApp({ completer, today: () => "2026-09-12" }), "/intent", { intent });

  assert.equal(seen, "2026-09-12");
});

test("hashes the confirmed policy the same way every other package does", async () => {
  const completer = stub(referencePolicy);
  const response = await post(createPurchaserApp({ completer }), "/confirm", {
    policy: referencePolicy,
  });

  assert.equal(response.status, 200);

  assert.equal(response.body.policyHash, hashPolicy(referencePolicy));
  // The buyer publishes this half, so a field that leaks into it is a field every supplier reads.
  assert.deepEqual(response.body.publicRequirements, {
    ...referencePolicy.hardRequirements,
    tradeDownStars: referencePolicy.tradeDown.stars,
  });
});

test("refuses to hash a policy that does not match the schema", async () => {
  const completer = stub(referencePolicy);
  const response = await post(createPurchaserApp({ completer }), "/confirm", {
    policy: makePolicy({ preferences: { refundable: -1 } }),
  });

  assert.equal(response.status, 422);
});
