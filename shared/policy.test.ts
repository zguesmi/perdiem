import { test } from "node:test";
import assert from "node:assert/strict";

import { makePolicy, referencePolicy } from "./reference-policy.ts";
import { policySchema, publicRequirements } from "./policy.ts";

// The schema is the only check on what one model call returns. Whatever it lets through is hashed,
// committed on chain, and cannot be corrected afterwards.

test("accepts the reference Policy unchanged", () => {
  // Every other case here builds on this one, so a fixture that drifted out of the schema would
  // otherwise leave the whole file green while asserting nothing.
  assert.deepEqual(policySchema.parse(referencePolicy), referencePolicy);
});

test("rejects a date that the calendar does not have", () => {
  assert.throws(() =>
    policySchema.parse(
      makePolicy({ hardRequirements: { checkin: "2026-02-30", checkout: "2026-03-02" } }),
    ),
  );
  assert.throws(() =>
    policySchema.parse(makePolicy({ hardRequirements: { checkin: "2026-99-99" } })),
  );
});

test("rejects a checkout that does not fall after checkin", () => {
  assert.throws(() =>
    policySchema.parse(
      makePolicy({ hardRequirements: { checkin: "2026-10-14", checkout: "2026-10-12" } }),
    ),
  );
});

test("rejects nights that disagree with the dates", () => {
  assert.throws(() => policySchema.parse(makePolicy({ nights: 99 })));
});

test("accepts a trade-down star level at or above minStars", () => {
  // docs/spec.md constrains tradeDown.stars to a star rating and nothing more. A trade-down that
  // never fires is redundant, not invalid, and rejecting it would burn the intent parse's one
  // retry on a Policy the spec permits.
  const redundant = makePolicy({ tradeDown: { stars: 5 } });

  assert.deepEqual(policySchema.parse(redundant), redundant);
});

test("rejects an unknown key at any depth", () => {
  assert.throws(() => policySchema.parse(makePolicy({ extra: 1 })));
  assert.throws(() => policySchema.parse(makePolicy({ hardRequirements: { extra: 1 } })));
  assert.throws(() => policySchema.parse(makePolicy({ preferences: { lateCheckout: 1 } })));
});

test("rejects a fractional amount, because a fraction has no single canonical form", () => {
  assert.throws(() => policySchema.parse(makePolicy({ maxPrice: 520.5 })));
  assert.throws(() => policySchema.parse(makePolicy({ preferences: { refundable: 0.5 } })));
});

test("rejects a currency the escrow does not hold", () => {
  assert.throws(() => policySchema.parse(makePolicy({ currency: "EUR" })));
});

test("publishes the public requirements and nothing else", () => {
  // What leaves this function is emitted on chain. A key added here is a key every supplier reads,
  // so the assertion is the whole object and not a field of it.
  assert.deepEqual(publicRequirements(referencePolicy), {
    city: "Paris",
    checkin: "2026-10-12",
    checkout: "2026-10-14",
    minStars: 4,
    roomType: "double",
    numberOfRooms: 1,
    tradeDownStars: 3,
  });
});
