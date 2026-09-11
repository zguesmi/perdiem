import assert from "node:assert/strict";
import { test } from "node:test";

import { systemPrompt } from "../src/bidder.ts";
import type { AuctionTerms } from "../src/tools.ts";

/** The public half of the reference policy, which is all a supplier sees. */
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

const hotel = { hotelId: "lp1beec", hotelName: "Hotel Des Grands Voyageurs", stars: 4 };
const rules = "You sell 4-star rooms in Paris.";

test("the system prompt states what the model has to derive and never the answer", () => {
  const prompt = systemPrompt(rules, auction, hotel);

  assert.match(prompt, /2026-10-12/);
  assert.match(prompt, /2026-10-14/);
  assert.match(prompt, /December, January and February/);
  assert.match(prompt, /Hotel Des Grands Voyageurs, 4 stars/);
  // The nights and the season come from the dates above, so neither may appear as an answer.
  assert.doesNotMatch(prompt, /2 nights|autumn/i);
});

test("the system prompt teaches no cryptography", () => {
  const prompt = systemPrompt(rules, auction, hotel);

  // A model that re-derived any of these would produce a commitment the enclave drops in silence.
  assert.doesNotMatch(prompt, /keccak|hashStruct|EIP-712|X25519|abi\.encode|0x1901/i);
  // It is told that it holds none of them, which is why it must call the tool once.
  assert.match(prompt, /never see or supply a hash, a salt, a signature or a key/);
});
