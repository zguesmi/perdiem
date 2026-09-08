import { test } from "node:test";
import assert from "node:assert/strict";
import type { Hono } from "hono";

import { createRelayApp } from "../src/app.ts";

// The relay's whole reason to exist: one sealed bid per supplier, stored as bytes, served whole to
// the workflow. Red until the store is implemented.

const auctionId = "0x00";
const supplier = "0xa11ce";
const sealedBid = "sealed-bid-ciphertext";

function put(app: Hono, body: string) {
  return app.request(`/auctions/${auctionId}/bids/${supplier}`, { method: "PUT", body });
}

test("accepts a supplier's first sealed bid", async () => {
  const response = await put(createRelayApp(), sealedBid);

  assert.equal(response.status, 201);
});

test("refuses a second sealed bid from the same supplier", async () => {
  const app = createRelayApp();
  await put(app, sealedBid);

  const response = await put(app, "a-different-ciphertext");

  assert.equal(response.status, 409);
});

test("refuses a sealed bid over the sixteen kibibyte cap", async () => {
  const response = await put(createRelayApp(), "x".repeat(16 * 1024 + 1));

  assert.equal(response.status, 413);
});

test("serves every sealed bid for an auction", async () => {
  const app = createRelayApp();
  await put(app, sealedBid);

  const response = await app.request(`/auctions/${auctionId}/bids`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), [{ supplier, ciphertext: sealedBid }]);
});

test("serves an empty list for an unknown auction", async () => {
  const response = await createRelayApp().request("/auctions/0xff/bids");

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), []);
});
