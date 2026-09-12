import { Hono, type Context } from "hono";
import { cors } from "hono/cors";

const MAX_CIPHERTEXT_BYTES = 16 * 1024;

/**
 * Reads the ciphertext off the request and stores it under `key`, once. First write wins: a sealed
 * bid is already committed to on chain, and a sealed policy is already hashed on chain, so a later
 * write could only swap the plaintext behind a fixed commitment, which the enclave then drops.
 */
async function store(context: Context, into: Map<string, string>, key: string): Promise<Response> {
  const ciphertext = await context.req.text();

  if (Buffer.byteLength(ciphertext) > MAX_CIPHERTEXT_BYTES) {
    return context.body(null, 413);
  }
  if (into.has(key)) {
    return context.body(null, 409);
  }

  into.set(key, ciphertext);
  return context.body(null, 201);
}

/**
 * The relay is deliberately blind. It stores opaque ciphertext and cannot read any of it: the bids,
 * their salts and their signatures, and the buyer's policy, are all sealed to the enclave's public
 * key before they leave the machine that made them.
 *
 * There is no authentication. Anyone can therefore fetch a ciphertext and count them, and they
 * learn no price, because only the enclave holds the private key. Bearer tokens are the obvious
 * hardening and are out of scope.
 */
export function createRelayApp(): Hono {
  // In memory, because a sealed bid outlives nothing but its own auction. Swapping either of these
  // for Redis touches no route and no test.
  const bids = new Map<string, Map<string, string>>();
  // Keyed by policy hash, not by auction identifier: the buyer uploads before `createAuction`
  // mines, and the identifier does not exist until it does.
  const policies = new Map<string, string>();

  const app = new Hono();

  // The page reads the sealed bids from a browser on another origin. Reads only: a cross-origin
  // PUT would let any page a supplier visits burn that supplier's first-write-wins slot.
  app.use("/auctions/*", cors({ origin: "*", allowMethods: ["GET"] }));

  // A supplier submits its sealed bid.
  app.put("/auctions/:auctionId/bids/:supplier", async (context) => {
    const auctionId = context.req.param("auctionId");
    let auction = bids.get(auctionId);
    if (!auction) {
      auction = new Map();
      bids.set(auctionId, auction);
    }

    // Addresses are case-insensitive, so two spellings of one supplier must be one key. Without
    // this, a supplier stores two sealed bids behind one commitment.
    return store(context, auction, context.req.param("supplier").toLowerCase());
  });

  // The enclave asks for one supplier's sealed bid, by the address the chain says committed. Every
  // answer is one blob under the size cap, so nobody can grow the enclave's read by posting bids
  // under addresses that never staked.
  app.get("/auctions/:auctionId/bids/:supplier", (context) => {
    const auction = bids.get(context.req.param("auctionId"));
    const ciphertext = auction?.get(context.req.param("supplier").toLowerCase());

    return ciphertext === undefined ? context.body(null, 404) : context.text(ciphertext);
  });

  // The page reads them all at once. The order is arrival order.
  app.get("/auctions/:auctionId/bids", (context) => {
    const auction = bids.get(context.req.param("auctionId")) ?? new Map<string, string>();

    return context.json([...auction].map(([supplier, ciphertext]) => ({ supplier, ciphertext })));
  });

  // The buyer uploads the sealed policy before it opens the auction.
  app.put("/policies/:policyHash", (context) =>
    store(context, policies, context.req.param("policyHash").toLowerCase()),
  );

  // The enclave fetches it with the hash it read from the chain, and checks what comes back
  // against that hash. A buyer that never uploaded is a 404, and that auction refunds on timeout.
  app.get("/policies/:policyHash", (context) => {
    const ciphertext = policies.get(context.req.param("policyHash").toLowerCase());

    return ciphertext === undefined ? context.body(null, 404) : context.text(ciphertext);
  });

  return app;
}
