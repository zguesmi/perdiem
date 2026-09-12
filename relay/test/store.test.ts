import { test } from "node:test";
import assert from "node:assert/strict";
import type { Hono } from "hono";

import { createRelayApp } from "../src/app.ts";

// The relay's whole reason to exist: one sealed bid per supplier, stored as bytes, served whole to
// the workflow.

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

test("refuses a second sealed bid spelled in another case", async () => {
  const app = createRelayApp();
  await put(app, sealedBid);

  const response = await app.request(`/auctions/${auctionId}/bids/0xA11CE`, {
    method: "PUT",
    body: "a-different-ciphertext",
  });

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

test("serves the sealed bids in arrival order", async () => {
  const app = createRelayApp();
  await app.request(`/auctions/${auctionId}/bids/0xb0b`, { method: "PUT", body: "bob" });
  await put(app, sealedBid);

  const response = await app.request(`/auctions/${auctionId}/bids`);

  assert.deepEqual(await response.json(), [
    { supplier: "0xb0b", ciphertext: "bob" },
    { supplier, ciphertext: sealedBid },
  ]);
});

test("serves an empty list for an unknown auction", async () => {
  const response = await createRelayApp().request("/auctions/0xff/bids");

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), []);
});

// The sealed policy. Same blindness, same first-write-wins rule, keyed by the policy hash the
// buyer put on chain before the auction existed.

const policyHash = `0x${"ab".repeat(32)}`;
const sealedPolicy = "sealed-policy-ciphertext";

function putPolicy(app: Hono, body: string) {
  return app.request(`/policies/${policyHash}`, { method: "PUT", body });
}

test("accepts the buyer's first sealed policy", async () => {
  const response = await putPolicy(createRelayApp(), sealedPolicy);

  assert.equal(response.status, 201);
});

test("refuses a second sealed policy under the same hash", async () => {
  const app = createRelayApp();
  await putPolicy(app, sealedPolicy);

  const response = await putPolicy(app, "a-different-ciphertext");

  assert.equal(response.status, 409);
});

test("refuses a sealed policy over the sixteen kibibyte cap", async () => {
  const response = await putPolicy(createRelayApp(), "x".repeat(16 * 1024 + 1));

  assert.equal(response.status, 413);
});

test("serves the sealed policy as the bytes it was given", async () => {
  const app = createRelayApp();
  await putPolicy(app, sealedPolicy);

  const response = await app.request(`/policies/${policyHash}`);

  assert.equal(response.status, 200);
  assert.equal(await response.text(), sealedPolicy);
});

test("answers 404 for a policy hash it never saw", async () => {
  const response = await createRelayApp().request(`/policies/0xff`);

  assert.equal(response.status, 404);
});
