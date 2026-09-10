import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { Bid } from "./bid.ts";

/**
 * `fixtures/bid-hashes.json`, typed. It is read from disk rather than imported so the Solidity
 * tests and the TypeScript tests consume the same bytes, not two copies that can drift.
 *
 * Regenerate it with `pnpm fixtures`. Never edit it by hand.
 */
export type BidFixture = {
  bid: Bid;
  salt: `0x${string}`;
  verifyingContract: `0x${string}`;
  bidHash: `0x${string}`;
  commitment: `0x${string}`;
  commitments: `0x${string}`[];
  bidsRoot: `0x${string}`;
  emptyBidsRoot: `0x${string}`;
};

export const BID_FIXTURE_PATH = fileURLToPath(
  new URL("./fixtures/bid-hashes.json", import.meta.url),
);

export const bidFixture = JSON.parse(readFileSync(BID_FIXTURE_PATH, "utf8")) as BidFixture;
