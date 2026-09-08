import { Hono } from "hono";

/**
 * The relay is deliberately blind. It stores one sealed bid per (auction, supplier) as opaque
 * ciphertext and cannot read any of it: the bid, its salt and its signature are all sealed to the
 * enclave's public key before they leave the supplier agent.
 *
 * Two tokens, two directions. Supplier agents hold a write-only token. The workflow holds the read
 * token. An agent that could read the relay could read a rival's price, which is the one thing this
 * service exists to prevent.
 */
export function createRelayApp(): Hono {
  const app = new Hono();

  // A supplier submits its sealed bid. Write token only.
  app.put("/auctions/:auctionId/bids/:supplier", (c) => c.text("Not implemented", 501));

  // The workflow collects every sealed bid for an auction. Read token only.
  app.get("/auctions/:auctionId/bids", (c) => c.text("Not implemented", 501));

  return app;
}
