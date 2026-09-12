import { Hono, type Context } from "hono";
import { z } from "zod";

import { hashPolicy } from "../../shared/policy-hash.ts";
import { policySchema, publicRequirements } from "../../shared/policy.ts";
import { payoutCapFor, type Funder } from "./funding.ts";
import type { IntentAgent } from "./intent.ts";
import { PolicyRefusedError } from "./privy.ts";

/**
 * The purchaser service is the buyer's side of the desk. It does two things and no more:
 *
 * 1. Turns one English sentence into a Policy, with a single model call and one retry at most.
 * 2. Hashes the Policy the buyer confirmed, and funds the auction that commits to that hash.
 */
export interface PurchaserOptions {
  /**
   * How a sentence becomes a candidate answer. It is a constructor argument rather than something
   * the routes build themselves, so the tests hand the service a canned answer and exercise the
   * validation, the retry and the hashing without a key, a network or a bill.
   */
  intentAgent: IntentAgent;
  /**
   * How the confirmed Policy becomes a funded auction. Injected for the same reason as the intent
   * agent: the route tests drive the whole confirmation with no Privy app and no chain.
   */
  funder: Funder;
  /**
   * The step the payout cap is rounded up to, in USDC minor units. It is what the cap leaks: the
   * band the maximum price falls in, and nothing sharper.
   */
  payoutCapBucket: bigint;
}

/** A candidate that fails validation buys exactly one more model call. Then the request fails. */
const ATTEMPTS = 2;

const intentRequest = z.object({ intent: z.string().min(1) }).strict();

const confirmRequest = z.object({ policy: z.unknown() }).strict();

/**
 * What the model answers with: the Policy, and the same thing in English for the buyer to read.
 * The summary is shown and then dropped. Only the Policy is canonicalized and hashed, so nothing
 * the model wrote in prose can change what reaches the chain.
 */
const answerValidator = z.object({ policy: policySchema, summary: z.string().min(1) }).strict();

/**
 * A body that is not JSON throws inside `context.req.json()`, which Hono answers with a 500. The
 * client sent something the service should simply reject, so both routes read the body through
 * here and reject it themselves.
 */
async function body(context: Context): Promise<unknown> {
  try {
    return await context.req.json();
  } catch {
    return undefined;
  }
}

export function createPurchaserApp({
  intentAgent,
  funder,
  payoutCapBucket,
}: PurchaserOptions): Hono {
  const app = new Hono();

  // One sentence in, a Policy out. Nothing is hashed here: the buyer has not confirmed yet.
  app.post("/intent", async (context) => {
    const request = intentRequest.safeParse(await body(context));
    if (!request.success) {
      return context.json({ error: "an intent is one non-empty sentence" }, 422);
    }

    // The second call is told what was wrong with the first. A byte-identical retry against a
    // model with no sampling parameters reproduces a deterministic failure and pays for it twice.
    let rejection: string | undefined;

    for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
      const answer = answerValidator.safeParse(await intentAgent(request.data.intent, rejection));
      if (answer.success) {
        return context.json(answer.data);
      }
      rejection = z.prettifyError(answer.error);
    }

    return context.json({ error: "the model could not produce a valid policy" }, 422);
  });

  // The buyer confirms. Canonicalize, hash, lock the payout cap in escrow and open the auction.
  // An invalid Policy is never hashed: a hash is a commitment, and this one reaches the chain.
  app.post("/confirm", async (context) => {
    const request = confirmRequest.safeParse(await body(context));
    const policy = policySchema.safeParse(request.data?.policy);
    if (!policy.success) {
      return context.json({ error: "the policy does not match the schema" }, 422);
    }

    const policyHash = hashPolicy(policy.data);
    const requirements = publicRequirements(policy.data);
    const payoutCap = payoutCapFor(BigInt(policy.data.maxPrice), payoutCapBucket);

    try {
      return context.json({
        policyHash,
        publicRequirements: requirements,
        payoutCap: String(payoutCap),
        ...(await funder(policyHash, requirements, payoutCap)),
      });
    } catch (reason) {
      // A price the organization will not fund is an answer to the buyer, not a fault. They lower
      // it and confirm again.
      if (reason instanceof PolicyRefusedError) {
        return context.json({ error: reason.message, payoutCap: String(payoutCap) }, 422);
      }
      throw reason;
    }
  });

  return app;
}
