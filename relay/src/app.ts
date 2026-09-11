import { Hono } from "hono";

const MAX_SEALED_BID_BYTES = 16 * 1024;

/**
 * The relay is deliberately blind. It stores one sealed bid per (auction, supplier) as opaque
 * ciphertext and cannot read any of it: the bid, its salt and its signature are all sealed to the
 * enclave's public key before they leave the supplier agent.
 *
 * There is no authentication. A supplier can therefore fetch a rival's ciphertext and count the
 * bids, and it learns no price, because only the enclave holds the private key. Bearer tokens are
 * the obvious hardening and are out of scope.
 */
export function createRelayApp(): Hono {
  // auctionId -> supplier -> ciphertext. In memory, because a sealed bid outlives nothing but its
  // own auction. Swapping this for Redis touches no route and no test.
  const bids = new Map<string, Map<string, string>>();

  const app = new Hono();

  // A supplier submits its sealed bid. First write wins, because the commitment is already on
  // chain: a later write could only swap the bid behind a fixed commitment, which the enclave drops.
  app.put("/auctions/:auctionId/bids/:supplier", async (c) => {
    const { auctionId } = c.req.param();
    // Addresses are case-insensitive, so two spellings of one supplier must be one key. Without
    // this, a supplier stores two sealed bids behind one commitment.
    const supplier = c.req.param("supplier").toLowerCase();
    const ciphertext = await c.req.text();

    if (Buffer.byteLength(ciphertext) > MAX_SEALED_BID_BYTES) return c.body(null, 413);

    let auction = bids.get(auctionId);
    if (!auction) bids.set(auctionId, (auction = new Map()));
    if (auction.has(supplier)) return c.body(null, 409);

    auction.set(supplier, ciphertext);
    return c.body(null, 201);
  });

  // The workflow collects every sealed bid for an auction, ascending by supplier address.
  app.get("/auctions/:auctionId/bids", (c) => {
    const auction = bids.get(c.req.param("auctionId")) ?? new Map<string, string>();

    return c.json(
      [...auction]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([supplier, ciphertext]) => ({ supplier, ciphertext })),
    );
  });

  return app;
}
