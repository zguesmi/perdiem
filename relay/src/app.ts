import { Hono, type Context } from "hono";
import { cors } from "hono/cors";

const MAX_CIPHERTEXT_BYTES = 16 * 1024;

/**
 * What the relay did with one request. The relay holds only ciphertext, so a line can carry the
 * path, the status and a size, and nothing else it stores.
 */
function log(context: Context, status: number, note: string): void {
  console.log(`relay: ${context.req.method} ${context.req.path} ${status}, ${note}`);
}

/**
 * Reads the ciphertext off the request and stores it under `key`, once. First write wins: a sealed
 * bid is already committed to on chain, and a sealed policy is already hashed on chain, so a later
 * write could only swap the plaintext behind a fixed commitment, which the enclave then drops.
 */
async function store(context: Context, into: Map<string, string>, key: string): Promise<Response> {
  const ciphertext = await context.req.text();
  const bytes = Buffer.byteLength(ciphertext);

  if (bytes > MAX_CIPHERTEXT_BYTES) {
    log(context, 413, `refused, ${bytes} bytes is over the size cap`);
    return context.body(null, 413);
  }
  if (into.has(key)) {
    log(context, 409, "refused, one is already stored under that key");
    return context.body(null, 409);
  }

  into.set(key, ciphertext);
  log(context, 201, `stored ${bytes} bytes`);
  return context.body(null, 201);
}

/**
 * Answers one key, and says whether it had it. The page's poll of the whole list is not logged: it
 * repeats every few seconds and would bury the reads that matter.
 */
function serve(context: Context, ciphertext: string | undefined): Response {
  if (ciphertext === undefined) {
    log(context, 404, "nothing is stored under that key");
    return context.body(null, 404);
  }

  log(context, 200, `served ${Buffer.byteLength(ciphertext)} bytes`);
  return context.text(ciphertext);
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

    return serve(context, auction?.get(context.req.param("supplier").toLowerCase()));
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
  app.get("/policies/:policyHash", (context) =>
    serve(context, policies.get(context.req.param("policyHash").toLowerCase())),
  );

  return app;
}
