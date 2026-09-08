import { test } from "node:test";
import assert from "node:assert/strict";

import { createRelayApp } from "../src/app.ts";

// The relay's whole reason to exist: a supplier can write its own sealed bid and can read nothing.
// Red until the token check and the store are implemented.

const WRITE_TOKEN = "write-token-for-tests";
const READ_TOKEN = "read-token-for-tests";

const auctionId = "0x00";
const supplier = "0xa11ce";
const sealedBid = "sealed-bid-ciphertext";

test("accepts a sealed bid from a supplier holding the write token", async () => {
  const response = await createRelayApp().request(`/auctions/${auctionId}/bids/${supplier}`, {
    method: "PUT",
    headers: { authorization: `Bearer ${WRITE_TOKEN}` },
    body: sealedBid,
  });

  assert.equal(response.status, 204);
});

test("refuses to serve sealed bids to the write token", async () => {
  const response = await createRelayApp().request(`/auctions/${auctionId}/bids`, {
    headers: { authorization: `Bearer ${WRITE_TOKEN}` },
  });

  assert.equal(response.status, 403);
});

test("serves sealed bids to the read token", async () => {
  const response = await createRelayApp().request(`/auctions/${auctionId}/bids`, {
    headers: { authorization: `Bearer ${READ_TOKEN}` },
  });

  assert.equal(response.status, 200);
});

test("refuses an unauthenticated request", async () => {
  const response = await createRelayApp().request(`/auctions/${auctionId}/bids`);

  assert.equal(response.status, 401);
});
