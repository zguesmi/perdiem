import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";

import { cyan, describeError, green, red, separator, shortHex, step } from "../../shared/log.ts";
import { hashPolicy } from "../../shared/policy-hash.ts";
import { policySchema, publicRequirements } from "../../shared/policy.ts";
import { sealPolicy } from "../../shared/sealed-policy.ts";
import { payoutCapFor, type Funder } from "./funding.ts";
import { parseIntent, type PolicyAgent } from "./policy-agent.ts";
import type { PolicyUploader } from "./policy-upload.ts";
import { PolicyRefusedError } from "./privy.ts";

/**
 * The purchaser service is the buyer's side of the desk. It does two things and no more:
 *
 * 1. Turns one English sentence into a Policy, with an agent that checks its own candidates.
 * 2. Hashes the Policy the buyer confirmed, seals it to the enclave, and funds the auction that
 *    commits to that hash.
 */
export interface PurchaserOptions {
  /**
   * How a sentence becomes a candidate answer. It is a constructor argument rather than something
   * the routes build themselves, so the tests hand the service a canned answer and exercise the
   * validation and the hashing without a key, a network or a bill.
   */
  policyAgent: PolicyAgent;
  /**
   * How the confirmed Policy becomes a funded auction. Injected for the same reason as the policy
   * agent: the route tests drive the whole confirmation with no Privy app and no chain.
   */
  funder: Funder;
  /** Where the sealed policy goes so the enclave can fetch it by the hash on chain. */
  uploadPolicy: PolicyUploader;
  /**
   * The step the payout cap is rounded up to, in USDC minor units. It is what the cap leaks: the
   * band the maximum price falls in, and nothing sharper.
   */
  payoutCapBucket: bigint;
  /** The deployment's X25519 public half, read from `SealedAuction`. The buyer seals to it. */
  enclavePublicKey: Uint8Array;
  /** The one origin the page is served from. Any other origin is refused before the request. */
  pageOrigin: string;
}

const intentRequest = z.object({ intent: z.string().min(1) }).strict();

const confirmRequest = z.object({ policy: z.unknown() }).strict();

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
  policyAgent,
  funder,
  uploadPolicy,
  payoutCapBucket,
  enclavePublicKey,
  pageOrigin,
}: PurchaserOptions): Hono {
  const app = new Hono();

  // The page is on another origin, and one origin is named rather than all of them. The service's
  // authority is ambient: it holds the Privy keys, so any page the buyer visits could otherwise
  // fund an auction against a policy it wrote, and win it from its own supplier wallet.
  app.use("/*", cors({ origin: pageOrigin, allowMethods: ["POST"] }));

  // One sentence in, a Policy out. Nothing is hashed here: the buyer has not confirmed yet.
  app.post("/intent", async (context) => {
    const request = intentRequest.safeParse(await body(context));
    if (!request.success) {
      return context.json({ error: "an intent is one non-empty sentence" }, 422);
    }

    console.log(separator());
    const answer = await parseIntent(policyAgent, request.data.intent);

    return answer === undefined
      ? context.json({ error: "the model could not produce a valid policy" }, 422)
      : context.json(answer);
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

    // Before the auction, never after: the enclave fetches the policy by the hash the chain
    // carries, and an auction whose policy never arrived pays nobody and refunds on timeout.
    const envelope = sealPolicy(policy.data, enclavePublicKey, policyHash);
    console.log(step("Policy hashed", cyan(shortHex(policyHash))));
    console.log(step("Policy sealed", `${envelope.length} bytes to the enclave key`));

    try {
      await uploadPolicy(policyHash, envelope);
      console.log(step("Policy uploaded", `${green("✓")} the relay holds it under the hash`));
    } catch (reason) {
      // The reasons, not the error: a stack from this path can carry the policy that failed.
      console.error(
        red(`confirm: the sealed policy did not reach the relay: ${describeError(reason)}`),
      );
      return context.json({ error: "the sealed policy did not reach the relay" }, 502);
    }

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

  // Anything that reached neither `catch` above. Hono answers a 500 and says nothing, so without
  // this the only record of a failed confirmation is the status code the buyer saw.
  app.onError((error, context) => {
    console.error(red(`${context.req.method} ${context.req.path}: ${describeError(error)}`));
    return context.json({ error: "the purchaser service failed" }, 500);
  });

  return app;
}
