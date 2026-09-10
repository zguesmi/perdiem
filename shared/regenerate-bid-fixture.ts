import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { bidCommitment, bidHash, bidsRoot } from "./bid.ts";
import { GOLDEN_COMMITMENTS, GOLDEN_SALT, VERIFYING_CONTRACT, goldenBid } from "./golden-bid.ts";

/**
 * Writes `fixtures/bid-hashes.json`, the one file every hash implementation asserts against. No
 * side computes its own expected value, so a divergence between TypeScript and Solidity names
 * itself instead of killing an auction silently.
 *
 * Run `pnpm fixtures` after any change to the bid struct, the golden bid or `version`, and read
 * the diff before committing it: a changed hash here is a changed hash on chain.
 */

const fixture = {
  bid: goldenBid,
  salt: GOLDEN_SALT,
  verifyingContract: VERIFYING_CONTRACT,
  bidHash: bidHash(goldenBid),
  commitment: bidCommitment(bidHash(goldenBid), GOLDEN_SALT),
  commitments: GOLDEN_COMMITMENTS,
  bidsRoot: bidsRoot(GOLDEN_COMMITMENTS),
  emptyBidsRoot: bidsRoot([]),
};

const path = fileURLToPath(new URL("./fixtures/bid-hashes.json", import.meta.url));

writeFileSync(path, `${JSON.stringify(fixture, undefined, 2)}\n`);

console.log(`wrote ${path}`);
