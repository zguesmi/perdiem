import assert from "node:assert/strict";
import { test } from "node:test";

import { policySchema } from "../../shared/policy.ts";
import { createPurchaserApp } from "../src/app.ts";
import { createCompleter } from "../src/intent.ts";

/**
 * The one test that spends money and needs the network. It is skipped without a key, so it never
 * runs in continuous integration: a run of it is a human checking the prompt by hand.
 *
 * Run it with `ANTHROPIC_API_KEY=... pnpm --filter @perdiem/purchaser test`.
 */
const intent =
  "Two nights in Paris from 12 October 2026, one double room, 4 stars or better, " +
  "no more than 520 USDC for the stay. Free cancellation is worth 25 a night and " +
  "breakfast 20 a night. I would take 3 stars if it were 30% cheaper.";

test(
  "the real prompt turns the demo sentence into the demo policy",
  { skip: process.env.ANTHROPIC_API_KEY ? false : "no ANTHROPIC_API_KEY" },
  async () => {
    const app = createPurchaserApp({
      completer: createCompleter(process.env.INTENT_MODEL ?? "claude-opus-5"),
      today: () => "2026-09-12",
    });

    const response = await app.request("/intent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intent }),
    });

    assert.equal(response.status, 200);

    const policy = policySchema.parse(((await response.json()) as { policy: unknown }).policy);

    // The numbers the sentence states, converted once: per-night bonuses become per-trip amounts.
    assert.equal(policy.maxPrice, 520_000_000);
    assert.equal(policy.nights, 2);
    assert.equal(policy.preferences.refundable, 50_000_000);
    assert.equal(policy.preferences.breakfastIncluded, 40_000_000);
    assert.deepEqual(policy.tradeDown, { stars: 3, requiredDiscountPercentage: 30 });
    assert.equal(policy.hardRequirements.checkin, "2026-10-12");
    assert.equal(policy.hardRequirements.checkout, "2026-10-14");
    assert.equal(policy.hardRequirements.minStars, 4);
  },
);
