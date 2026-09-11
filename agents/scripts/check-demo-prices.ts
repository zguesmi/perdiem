/**
 * Runs the three agents against the reference auction and prints the price each one bid.
 *
 * It calls the real model, so it costs money and it is not part of `pnpm test`. The chain and the
 * relay are stubbed: nothing is signed on Arc and nothing is stored. Run it after any change to a
 * prompt, a price range or the system prompt.
 *
 *   ANTHROPIC_API_KEY=... pnpm --filter @perdiem/agents check:prices
 */
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { x25519 } from "@noble/curves/ed25519.js";
import { hexToBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { BID_TYPES, bidDomain, bidMessage } from "../../shared/bid.ts";
import { openSealedBid } from "../../shared/sealed-bid.ts";
import { runBidder } from "../src/bidder.ts";
import { loadAgentConfig } from "../src/config.ts";
import type { Signer } from "../src/signer.ts";
import type { AuctionTerms, BidRunContext } from "../src/tools.ts";

/** The public half of the reference policy. Two nights in Paris, in October, one double room. */
const auction: AuctionTerms = {
  auctionId: `0x${"a1".repeat(32)}`,
  bidDeadline: Math.floor(Date.now() / 1000) + 3600,
  city: "Paris",
  checkin: "2026-10-12",
  checkout: "2026-10-14",
  minStars: 4,
  roomType: "double",
  numberOfRooms: 1,
  tradeDownStars: 3,
};

/** What the demo table in `docs/spec.md` holds. */
const EXPECTED: Record<string, number> = {
  "hotel-astoria-agent": 330_000_000,
  "victoria-palace-agent": 400_000_000,
  "grands-voyageurs-agent": 440_000_000,
};

const ENCLAVE_KEY = new Uint8Array(32).fill(7);
const SEALED_AUCTION = "0x000000000000000000000000000000000000dEaD" as const;

async function priceBidBy(name: string): Promise<number> {
  const config = await loadAgentConfig(
    fileURLToPath(new URL(`../config/${name}.json`, import.meta.url)),
  );
  const rules = (await readFile(new URL(`../prompts/${name}.txt`, import.meta.url), "utf8")).trim();

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

  let sealed = "";
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    if (String(url).startsWith("http://relay.invalid")) {
      sealed = String(init?.body);
      return new Response(null, { status: 201 });
    }
    return realFetch(url, init);
  }) as typeof fetch;

  const context: BidRunContext = {
    auction,
    hotel: config.hotel,
    signer,
    sealedAuction: SEALED_AUCTION,
    usdc: "0x0000000000000000000000000000000000000001",
    stake: 50_000_000n,
    enclavePublicKey: x25519.getPublicKey(ENCLAVE_KEY),
    relayUrl: "http://relay.invalid",
    booking: { bookingUrl: "https://booking.invalid", bookingApiKey: "unused" },
    priceRange: config.priceRange,
  };

  try {
    await runBidder(config, rules, context);
  } finally {
    globalThis.fetch = realFetch;
  }

  return openSealedBid(hexToBytes(sealed as `0x${string}`), ENCLAVE_KEY, auction.auctionId).bid
    .price;
}

const names = (await readdir(fileURLToPath(new URL("../config", import.meta.url))))
  .filter((file) => file.endsWith(".json"))
  .map((file) => file.replace(/\.json$/, ""));

let wrong = 0;
for (const name of names) {
  const price = await priceBidBy(name);
  const expected = EXPECTED[name];
  const verdict = expected === undefined ? "no expected price" : price === expected ? "ok" : "WRONG";
  if (verdict === "WRONG") {
    wrong += 1;
  }
  console.log(`${name}: ${price} (expected ${expected ?? "-"}) ${verdict}`);
}

process.exit(wrong === 0 ? 0 : 1);
