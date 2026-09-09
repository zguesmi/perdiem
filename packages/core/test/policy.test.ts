import { test } from "node:test";
import assert from "node:assert/strict";

import { goldenPolicy } from "../src/golden-policy.ts";
import { policySchema } from "../src/policy.ts";

// The schema is the only check on what one model call returns. Whatever it lets through is hashed,
// committed on chain, and cannot be corrected afterwards.

function withHardRequirements(overrides: Record<string, unknown>) {
  return {
    ...goldenPolicy,
    hardRequirements: { ...goldenPolicy.hardRequirements, ...overrides },
  };
}

test("rejects a date that the calendar does not have", () => {
  assert.throws(() =>
    policySchema.parse(
      withHardRequirements({ checkin: "2026-02-30", checkout: "2026-03-02", nights: 2 }),
    ),
  );
  assert.throws(() => policySchema.parse(withHardRequirements({ checkin: "2026-99-99" })));
});

test("rejects a checkout that does not fall after checkin", () => {
  assert.throws(() =>
    policySchema.parse(withHardRequirements({ checkin: "2026-10-14", checkout: "2026-10-12" })),
  );
});

test("rejects nights that disagree with the dates", () => {
  assert.throws(() => policySchema.parse({ ...goldenPolicy, nights: 99 }));
});

test("accepts a trade-down star level at or above minStars", () => {
  // docs/spec.md constrains tradeDown.stars to a star rating and nothing more. A trade-down that
  // never fires is redundant, not invalid, and rejecting it would burn the intent parse's one
  // retry on a Policy the spec permits.
  const redundant = { ...goldenPolicy, tradeDown: { ...goldenPolicy.tradeDown, stars: 5 } };

  assert.deepEqual(policySchema.parse(redundant), redundant);
});

test("rejects an unknown key at any depth", () => {
  assert.throws(() => policySchema.parse({ ...goldenPolicy, extra: 1 }));
  assert.throws(() => policySchema.parse(withHardRequirements({ extra: 1 })));
  assert.throws(() =>
    policySchema.parse({
      ...goldenPolicy,
      preferences: { ...goldenPolicy.preferences, lateCheckout: 1 },
    }),
  );
});

test("rejects a fractional amount, because a fraction has no single canonical form", () => {
  assert.throws(() => policySchema.parse({ ...goldenPolicy, maxPrice: 520.5 }));
  assert.throws(() =>
    policySchema.parse({
      ...goldenPolicy,
      preferences: { ...goldenPolicy.preferences, refundable: 0.5 },
    }),
  );
});

test("rejects a currency the escrow does not hold", () => {
  assert.throws(() => policySchema.parse({ ...goldenPolicy, currency: "EUR" }));
});
