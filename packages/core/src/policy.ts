import { z } from "zod";

/**
 * The schema version. It is inside the Policy Hash and is read by nothing during scoring: its job
 * is to make a schema change a different hash, and to let a revealed Policy explain its numbers.
 * A changed field name, unit or number means a new version and a regenerated golden fixture.
 */
export const POLICY_VERSION = 1;

/** One to five, the star ratings a hotel can carry. */
const starRating = z.int().min(1).max(5);

/**
 * A whole number of USDC minor units. Never a fraction: docs/adr/0003-canonical-encoding.md is
 * only unambiguous over integers, and `z.int()` also caps the safe integer range that
 * canonicalJson requires.
 */
const usdcAmount = z.int().min(0);

const locationSchema = z.strictObject({
  name: z.string().min(1),
  // Microdegrees, because a decimal degree is a fraction and a fraction has more than one shortest
  // decimal form.
  latitudeMicro: z.int().min(-90_000_000).max(90_000_000),
  longitudeMicro: z.int().min(-180_000_000).max(180_000_000),
});

const hardRequirementsSchema = z
  .strictObject({
    city: z.string().min(1),
    checkin: z.iso.date(),
    checkout: z.iso.date(),
    minStars: starRating,
    roomType: z.string().min(1),
    numberOfRooms: z.int().min(1),
    location: locationSchema,
    radiusMeters: z.int().min(0),
  })
  .refine((requirements) => requirements.checkout > requirements.checkin, {
    // ISO dates compare correctly as strings, so no date parsing is needed here.
    message: "checkout must be after checkin",
    path: ["checkout"],
  });

const tradeDownSchema = z.strictObject({
  stars: starRating,
  requiredDiscountPercentage: z.int().min(0).max(100),
});

/**
 * Every attribute a bid can claim and what it is worth on this trip. A Preference Bonus is a flat
 * amount in USDC minor units so it is comparable with price, and it is never paid to anyone.
 */
const preferencesSchema = z.strictObject({
  refundable: usdcAmount,
  breakfastIncluded: usdcAmount,
});

/**
 * The buyer's private ruleset. Only its hash reaches the chain; the document itself goes to the
 * Enclave as a workflow secret and nowhere else. The shape is the one in docs/spec.md.
 *
 * Every object is strict, because an unknown key is extra bytes in the canonical encoding and
 * therefore a different Policy Hash. Dropping it silently and carrying it silently are both wrong.
 */
export const policySchema = z.strictObject({
  version: z.literal(POLICY_VERSION),
  // The escrow token. Inside the hash, read by nothing during scoring.
  currency: z.literal("USDC"),
  maxPrice: usdcAmount.min(1),
  nights: z.int().min(1),
  hardRequirements: hardRequirementsSchema,
  tradeDown: tradeDownSchema,
  preferences: preferencesSchema,
});

export type Policy = z.infer<typeof policySchema>;
