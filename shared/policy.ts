import { z } from "zod";

/**
 * The Policy is the buyer's private ruleset. Only its hash reaches the chain, and only the enclave
 * ever reads it.
 *
 * The schema is the one in `docs/spec.md`. A changed field name, unit or number changes every
 * Policy Hash, so a change needs a new `version` and the literals in
 * `policy-hash.test.ts` regenerated.
 */

/** Every number is an integer. A fraction has more than one shortest decimal form. */
const integer = z.int();

const nonNegativeInteger = integer.min(0);

const positiveInteger = integer.min(1);

const stars = integer.min(1).max(5);

/** ISO 8601 calendar date. A timestamp would carry a timezone the buyer never stated. */
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
  // The shape check alone accepts 2026-02-30. That date reaches no hotel, the Policy Hash is
  // already on chain by then, and the auction dies in timeoutRefund.
  .refine((date) => new Date(`${date}T00:00:00Z`).toISOString().startsWith(date), {
    message: "no such date in the calendar",
  });

/** Whole days between two calendar dates. Both are UTC midnight, so no hour is ever partial. */
function nightsBetween(checkin: string, checkout: string): number {
  const millisecondsPerDay = 86_400_000;
  const from = Date.parse(`${checkin}T00:00:00Z`);
  const to = Date.parse(`${checkout}T00:00:00Z`);

  return (to - from) / millisecondsPerDay;
}

const hardRequirementsSchema = z
  .object({
    city: z.string().min(1),
    checkin: calendarDate,
    checkout: calendarDate,
    minStars: stars,
    roomType: z.string().min(1),
    numberOfRooms: positiveInteger,
  })
  .strict();

const tradeDownSchema = z
  .object({
    stars,
    requiredDiscountPercentage: integer.min(0).max(100),
  })
  .strict();

/**
 * A Preference Bonus is a flat number in USDC minor units, not a rate. "20 a night" is converted to
 * what it is worth on this trip before the buyer confirms.
 */
const preferencesSchema = z
  .object({
    refundable: nonNegativeInteger,
    breakfastIncluded: nonNegativeInteger,
  })
  .strict();

/**
 * `.strict()` at every level on purpose. An unknown key from a model response would sail into the
 * hash and make the enclave's Policy a different document from the buyer's.
 */
export const policySchema = z
  .object({
    // version, currency and nights are read by nothing during scoring. They keep a schema change a
    // different hash, and they let a revealed Policy explain its own numbers.
    version: positiveInteger,
    currency: z.literal("USDC"),
    maxPrice: positiveInteger,
    nights: positiveInteger,
    hardRequirements: hardRequirementsSchema,
    tradeDown: tradeDownSchema,
    preferences: preferencesSchema,
  })
  .strict()
  // The two rules a field type cannot carry. `tradeDown.stars` gets no rule of its own, because
  // docs/spec.md constrains it no further than a star rating.
  .refine(
    (policy) => policy.hardRequirements.checkout > policy.hardRequirements.checkin,
    "checkout must fall after checkin",
  )
  .refine(
    (policy) =>
      policy.nights ===
      nightsBetween(policy.hardRequirements.checkin, policy.hardRequirements.checkout),
    "nights must equal the number of nights between checkin and checkout",
  );

export type Policy = z.infer<typeof policySchema>;
