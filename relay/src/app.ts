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
  app.put("/auctions/:auctionId/bids/:supplier", async (context) => {
    const auctionId = context.req.param("auctionId");
    // Addresses are case-insensitive, so two spellings of one supplier must be one key. Without
    // this, a supplier stores two sealed bids behind one commitment.
    const supplier = context.req.param("supplier").toLowerCase();
    const ciphertext = await context.req.text();

    if (Buffer.byteLength(ciphertext) > MAX_SEALED_BID_BYTES) {
      return context.body(null, 413);
    }

    let auction = bids.get(auctionId);
    if (!auction) {
      auction = new Map();
      bids.set(auctionId, auction);
    }
    if (auction.has(supplier)) {
      return context.body(null, 409);
    }

    auction.set(supplier, ciphertext);
    return context.body(null, 201);
  });

  // The workflow collects every sealed bid for an auction. The order is arrival order: the enclave
  // matches each bid to its own on-chain commitment, and the bids root follows the chain's array.
  app.get("/auctions/:auctionId/bids", (context) => {
    const auction = bids.get(context.req.param("auctionId")) ?? new Map<string, string>();

    return context.json([...auction].map(([supplier, ciphertext]) => ({ supplier, ciphertext })));
  });

  return app;
}
