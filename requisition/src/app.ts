import { Hono } from "hono";

/**
 * The requisition service is the buyer's side of the desk. It does two things and no more:
 *
 * 1. Turns one English sentence into a Policy, with a single LLM call and one retry at most.
 * 2. Gets that spend approved and locked: the Privy organization wallet signs `createAuction`, and
 *    a key quorum approves anything above the ceiling.
 *
 * It does not score, does not book, does not hold bids, and never reads the relay.
 */
export function createRequisitionApp(): Hono {
  const app = new Hono();

  // One sentence in, a Policy out. Rejected outright if it fails schema validation.
  app.post("/intent", (c) => c.text("Not implemented", 501));

  // The buyer confirms the Policy. Canonicalize, hash, upload the secrets, fund the auction.
  app.post("/confirm", (c) => c.text("Not implemented", 501));

  return app;
}
