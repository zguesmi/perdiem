import { Hono } from "hono";
import { z } from "zod";

import { hashPolicy } from "../../shared/policy-hash.ts";
import { policySchema, publicRequirements } from "../../shared/policy.ts";
import type { Completer } from "./intent.ts";

/**
 * The purchaser service is the buyer's side of the desk. It does two things and no more:
 *
 * 1. Turns one English sentence into a Policy, with a single model call and one retry at most.
 * 2. Hashes the Policy the buyer confirmed, with the encoder every other package uses.
 *
 * It does not score, does not book, does not hold bids, and never reads the relay.
 */
export interface PurchaserOptions {
  completer: Completer;
  /** Injected so a test states the date the buyer's "12 October" resolves against. */
  today?: () => string;
}

/** A candidate that fails the schema buys exactly one more model call. Then the request fails. */
const ATTEMPTS = 2;

const intentRequest = z.object({ intent: z.string().min(1) }).strict();

const confirmRequest = z.object({ policy: z.unknown() }).strict();

export function createPurchaserApp({ completer, today }: PurchaserOptions): Hono {
  const date = today ?? (() => new Date().toISOString().slice(0, 10));

  const app = new Hono();

  // One sentence in, a Policy out. Nothing is hashed here: the buyer has not confirmed yet.
  app.post("/intent", async (context) => {
    const request = intentRequest.safeParse(await context.req.json());
    if (!request.success) {
      return context.json({ error: "an intent is one non-empty sentence" }, 422);
    }

    for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
      const policy = policySchema.safeParse(await completer(request.data.intent, date()));
      if (policy.success) {
        return context.json({ policy: policy.data });
      }
    }

    return context.json({ error: "the model could not produce a valid policy" }, 422);
  });

  // The buyer confirms. Canonicalize and hash, and publish the half of the Policy suppliers see.
  // An invalid Policy is never hashed: a hash is a commitment, and this one reaches the chain.
  app.post("/confirm", async (context) => {
    const request = confirmRequest.safeParse(await context.req.json());
    const policy = policySchema.safeParse(request.data?.policy);
    if (!policy.success) {
      return context.json({ error: "the policy does not match the schema" }, 422);
    }

    return context.json({
      policyHash: hashPolicy(policy.data),
      publicRequirements: publicRequirements(policy.data),
    });
  });

  return app;
}
