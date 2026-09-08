import { Hono } from "hono";

/**
 * The relay is deliberately blind. It stores one sealed bid per (auction, supplier) as opaque
 * ciphertext and cannot read any of it: the bid, its salt and its signature are all sealed to the
 * enclave's public key before they leave the supplier agent.
 *
 * There is no authentication. A supplier can therefore fetch a rival's ciphertext and count the
 * bids, and it learns no price, because only the enclave holds the private key. Bearer tokens are
 * the obvious hardening and are out of scope for the demo.
 */
export function createRelayApp(): Hono {
  const app = new Hono();

  // A supplier submits its sealed bid. First write wins, because the commitment is already on chain.
  app.put("/auctions/:auctionId/bids/:supplier", (c) => c.text("Not implemented", 501));

  // The workflow collects every sealed bid for an auction, ascending by supplier address.
  app.get("/auctions/:auctionId/bids", (c) => c.text("Not implemented", 501));

  return app;
}
