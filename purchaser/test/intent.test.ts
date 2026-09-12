import assert from "node:assert/strict";
import { test } from "node:test";

import { hashPolicy } from "../../shared/policy-hash.ts";
import { referencePolicy, makePolicy } from "../../shared/reference-policy.ts";
import { createPurchaserApp } from "../src/app.ts";
import type { Completer } from "../src/intent.ts";

const intent =
  "Paris, 12 to 14 October 2026, one double room, 4 star minimum, at most 520 USDC. " +
  "Free cancellation is worth 50. Breakfast is worth 40. I would accept 3 star if at least 30% cheaper.";

const summary = "Paris, 12 to 14 October 2026, 2 nights.\n1 double room, 4 stars or better.";

/** What the model answers with, so a test states only the half it is about. */
function answer(policy: unknown = referencePolicy, text: string = summary): unknown {
  return { policy, summary: text };
}

/** Answers with each candidate in turn, and records how many calls the service actually made. */
function stub(...candidates: unknown[]): Completer & { calls: () => number } {
  let calls = 0;
  const completer = async (): Promise<unknown> => candidates[calls++ % candidates.length];

  return Object.assign(completer, { calls: () => calls });
}

async function post(
  app: ReturnType<typeof createPurchaserApp>,
  path: string,
  requestBody: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

test("turns one sentence into a policy the buyer can read", async () => {
  const completer = stub(answer());
  const response = await post(createPurchaserApp({ completer }), "/intent", { intent });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.policy, referencePolicy);
  assert.equal(response.body.summary, summary);
  assert.equal(completer.calls(), 1);
});

test("rejects an answer that carries no summary for the buyer", async () => {
  // The buyer approves what they read, so a policy with nothing to read is not an answer.
  const completer = stub({ policy: referencePolicy });
  const response = await post(createPurchaserApp({ completer }), "/intent", { intent });

  assert.equal(response.status, 422);
});

test("retries a candidate that fails the schema exactly once", async () => {
  const completer = stub(answer(makePolicy({ hardRequirements: { minStars: 9 } })), answer());
  const response = await post(createPurchaserApp({ completer }), "/intent", { intent });

  assert.equal(response.status, 200);
  assert.equal(completer.calls(), 2);
});

test("tells the retry what was wrong with the first answer", async () => {
  // A byte-identical second call reproduces a deterministic failure and pays for it twice.
  const rejections: (string | undefined)[] = [];
  let call = 0;
  const completer: Completer = async (_intent, rejection) => {
    rejections.push(rejection);
    return call++ === 0 ? answer(makePolicy({ hardRequirements: { minStars: 9 } })) : answer();
  };

  await post(createPurchaserApp({ completer }), "/intent", { intent });

  assert.equal(rejections[0], undefined);
  assert.match(String(rejections[1]), /minStars/);
});

test("gives up after the second failure, and hashes nothing", async () => {
  const completer = stub(answer(makePolicy({ currency: "EUR" })));
  const response = await post(createPurchaserApp({ completer }), "/intent", { intent });

  assert.equal(response.status, 422);
  assert.equal(completer.calls(), 2);
  assert.equal(response.body.policy, undefined);
});

test("rejects a fractional price rather than rounding it", async () => {
  // Rounding would silently change the number the buyer is about to commit to on chain.
  const completer = stub(answer(makePolicy({ maxPrice: 520_000_000.5 })));
  const response = await post(createPurchaserApp({ completer }), "/intent", { intent });

  assert.equal(response.status, 422);
});

test("rejects a body that is not JSON rather than failing", async () => {
  const app = createPurchaserApp({ completer: stub(answer()) });

  for (const path of ["/intent", "/confirm"]) {
    const response = await app.request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });

    assert.equal(response.status, 422, path);
  }
});

test("hashes the confirmed policy the same way every other package does", async () => {
  const response = await post(createPurchaserApp({ completer: stub(answer()) }), "/confirm", {
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
  const response = await post(createPurchaserApp({ completer: stub(answer()) }), "/confirm", {
    policy: makePolicy({ preferences: { refundable: -1 } }),
  });

  assert.equal(response.status, 422);
});
