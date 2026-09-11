import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { x25519 } from "@noble/curves/ed25519.js";
import { hexToBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { BID_TYPES, bidDomain, bidMessage } from "../../shared/bid.ts";
import { openSealedBid } from "../../shared/sealed-bid.ts";
import { runBidder, systemPrompt } from "../src/bidder.ts";
import { loadAgentConfig } from "../src/config.ts";
import type { Signer } from "../src/signer.ts";
import type { AuctionTerms, BidRunContext } from "../src/tools.ts";

const SEALED_AUCTION = "0x000000000000000000000000000000000000dEaD" as const;
const ENCLAVE_KEY = new Uint8Array(32).fill(7);

/** The reference policy's public half, which is what a supplier gets to see. */
const auction: AuctionTerms = {
  auctionId: `0x${"a1".repeat(32)}`,
  bidDeadline: 2_000_000_000,
  city: "Paris",
  checkin: "2026-10-12",
  checkout: "2026-10-14",
  minStars: 4,
  roomType: "double",
  numberOfRooms: 1,
  tradeDownStars: 3,
};

function context(overrides: Partial<BidRunContext> = {}): BidRunContext {
  const account = privateKeyToAccount(`0x${"22".repeat(32)}`);
  const signer: Signer = {
    address: account.address,
    signBid: (bid, verifyingContract) =>
      account.signTypedData({
        domain: bidDomain(verifyingContract),
        types: BID_TYPES,
        primaryType: "Bid",
        message: bidMessage(bid),
      }),
    write: async () => `0x${"0".repeat(64)}`,
  };

  return {
    auction,
    hotel: { hotelId: "lp1beec", hotelName: "Hotel Des Grands Voyageurs", stars: 4 },
    signer,
    sealedAuction: SEALED_AUCTION,
    usdc: "0x0000000000000000000000000000000000000001",
    stake: 50_000_000n,
    enclavePublicKey: x25519.getPublicKey(ENCLAVE_KEY),
    relayUrl: "http://relay.test",
    booking: { bookingUrl: "https://api.liteapi.travel/v3.0", bookingApiKey: "booking-key" },
    priceBand: { min: 1, max: 1_000_000_000 },
    ...overrides,
  };
}

test("the system prompt states what the model has to derive and never the answer", () => {
  const prompt = systemPrompt("You sell 3-star rooms in Paris.", context());

  assert.match(prompt, /2026-10-12/);
  assert.match(prompt, /2026-10-14/);
  assert.match(prompt, /December, January and February/);
  assert.match(prompt, /Hotel Des Grands Voyageurs, 4 stars/);
  // Nights and season are derived from the dates above, so neither may appear as an answer.
  assert.doesNotMatch(prompt, /2 nights|autumn/i);
});

/**
 * The demo turns on three prices. The model derives each one from its own rate card plus the two
 * nights in the auction, so a prompt change that breaks the demo table fails here first.
 */
const DEMO_PRICES = {
  "hotel-astoria-agent": 330_000_000,
  "victoria-palace-agent": 400_000_000,
  "grands-voyageurs-agent": 440_000_000,
};

for (const [name, price] of Object.entries(DEMO_PRICES)) {
  test(`agent ${name} bids ${price} against the reference auction`, async (t) => {
    if (!process.env.ANTHROPIC_API_KEY) {
      return t.skip("needs ANTHROPIC_API_KEY");
    }

    const config = await loadAgentConfig(
      fileURLToPath(new URL(`../config/${name}.json`, import.meta.url)),
    );
    const rules = (
      await readFile(new URL(`../prompts/${name}.txt`, import.meta.url), "utf8")
    ).trim();

    let body = "";
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      if (String(url).startsWith("http://relay.test")) {
        body = String(init?.body);
        return new Response(null, { status: 201 });
      }
      return realFetch(url, init);
    }) as typeof fetch;
    t.after(() => {
      globalThis.fetch = realFetch;
    });

    await runBidder(config, rules, context({ priceBand: config.priceBand, hotel: config.hotel }));

    const { bid } = openSealedBid(hexToBytes(body as `0x${string}`), ENCLAVE_KEY, auction.auctionId);
    assert.equal(bid.price, price);
  });
}
