import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { x25519 } from "@noble/curves/ed25519.js";
import { hexToBytes, recoverTypedDataAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { BID_TYPES, bidCommitment, bidDomain, bidHash, bidMessage } from "../../shared/bid.ts";
import { openSealedBid } from "../../shared/sealed-bid.ts";
import { createTools, submitBid, type AuctionTerms, type BidRunContext } from "../src/tools.ts";
import type { Signer } from "../src/signer.ts";

const SEALED_AUCTION = "0x000000000000000000000000000000000000dEaD" as const;
const USDC = "0x0000000000000000000000000000000000000001" as const;
const AGENT_KEY = `0x${"22".repeat(32)}` as const;
const ENCLAVE_KEY = new Uint8Array(32).fill(7);

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

const offer = {
  hotelId: "lp1beec",
  hotelName: "Hotel Des Grands Voyageurs",
  stars: 4,
  price: 440_000_000,
  refundable: true,
  breakfastIncluded: true,
  roomType: "double",
  numberOfRooms: 1,
};

interface Write {
  address: string;
  functionName: string;
  args: readonly unknown[];
}

const realFetch = globalThis.fetch;

function harness(t: TestContext, overrides: Partial<BidRunContext> = {}) {
  const account = privateKeyToAccount(AGENT_KEY);
  const writes: Write[] = [];
  const posts: { url: string; body: string }[] = [];

  const signer: Signer = {
    address: account.address,
    signBid: (bid, verifyingContract) =>
      account.signTypedData({
        domain: bidDomain(verifyingContract),
        types: BID_TYPES,
        primaryType: "Bid",
        message: bidMessage(bid),
      }),
    async write(call) {
      writes.push({ address: call.address, functionName: call.functionName, args: call.args });
      return `0x${"0".repeat(64)}`;
    },
  };

  const context: BidRunContext = {
    auction,
    signer,
    sealedAuction: SEALED_AUCTION,
    usdc: USDC,
    stake: 50_000_000n,
    enclavePublicKey: x25519.getPublicKey(ENCLAVE_KEY),
    relayUrl: "http://relay.test",
    booking: { bookingUrl: "https://api.liteapi.travel/v3.0", bookingApiKey: "booking-key" },
    priceBand: { min: 420_000_000, max: 480_000_000 },
    liteApiKey: "hotels-key",
    ...overrides,
  };

  globalThis.fetch = (async (url: string | URL, init?: { body?: string }) => {
    posts.push({ url: String(url), body: String(init?.body) });
    return new Response(null, { status: 201 });
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
  });

  return { account, context, writes, posts };
}

test("refuses a price outside the band and names the band", async (t) => {
  const { context } = harness(t);

  await assert.rejects(
    submitBid(context, { ...offer, price: 500_000_000 }),
    /outside this supplier's band of 420000000 to 480000000/,
  );
});

test("approves the stake, then commits, then posts the sealed bid", async (t) => {
  const { context, writes, posts } = harness(t);

  await submitBid(context, offer);

  assert.deepEqual(
    writes.map((write) => write.functionName),
    ["approve", "commit"],
  );
  assert.equal(writes[0]?.address, USDC);
  assert.equal(writes[1]?.address, SEALED_AUCTION);
  assert.equal(posts.length, 1);
});

test("commits under the address that signed the bid, and posts under the same one", async (t) => {
  const { account, context, posts } = harness(t);

  await submitBid(context, offer);

  const envelope = openSealedBid(
    hexToBytes(posts[0]?.body as `0x${string}`),
    ENCLAVE_KEY,
    auction.auctionId,
  );
  const recovered = await recoverTypedDataAddress({
    domain: bidDomain(SEALED_AUCTION),
    types: BID_TYPES,
    primaryType: "Bid",
    message: bidMessage(envelope.bid),
    signature: envelope.signature,
  });

  assert.equal(envelope.bid.supplier, account.address);
  assert.equal(recovered, account.address);
  assert.ok(posts[0]?.url.endsWith(`/bids/${account.address}`));
});

test("the on-chain commitment opens with the salt inside the envelope", async (t) => {
  const { context, writes, posts } = harness(t);

  await submitBid(context, offer);

  const envelope = openSealedBid(
    hexToBytes(posts[0]?.body as `0x${string}`),
    ENCLAVE_KEY,
    auction.auctionId,
  );

  assert.equal(writes[1]?.args[1], bidCommitment(bidHash(envelope.bid), envelope.salt));
});

test("the band refusal carries no salt, signature or booking key", async (t) => {
  const { context } = harness(t);

  const error = await submitBid(context, { ...offer, price: 1 }).then(
    () => new Error("the bid was accepted"),
    (thrown: Error) => thrown,
  );

  assert.doesNotMatch(error.message, /booking-key|0x[0-9a-f]{64}/);
});

test("refuses a bid after the deadline, before it touches the chain", async (t) => {
  const { context, writes } = harness(t, {
    auction: { ...auction, bidDeadline: Math.floor(Date.now() / 1000) - 1 },
  });

  await assert.rejects(submitBid(context, offer), /the bid deadline has passed/);
  assert.equal(writes.length, 0);
});

test("refuses a second bid once the stake is committed", async (t) => {
  const { context, writes } = harness(t);
  const { submit } = createTools(context);

  await submit(offer);
  await assert.rejects(submit(offer), /already committed its one bid/);
  assert.deepEqual(
    writes.map((write) => write.functionName),
    ["approve", "commit"],
  );
});
