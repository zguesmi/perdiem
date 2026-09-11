import assert from "node:assert/strict";
import { test } from "node:test";
import type { PublicClient } from "viem";

import type { AuctionTerms } from "../src/tools.ts";
import { watchAuctions, type PublicRequirements } from "../src/watcher.ts";

const SEALED_AUCTION = "0x000000000000000000000000000000000000dEaD" as const;
const FIRST = `0x${"a1".repeat(32)}` as const;
const SECOND = `0x${"b2".repeat(32)}` as const;

const requirements: PublicRequirements = {
  city: "Paris",
  checkin: "2026-10-12",
  checkout: "2026-10-14",
  minStars: 4,
  roomType: "double",
  numberOfRooms: 1,
  tradeDownStars: 3,
};

/** The auction record as the generated getter returns it. Index 3 is `bidDeadline`. */
const auctionRecord = [
  2,
  "0x0000000000000000000000000000000000000b0b",
  1n,
  7_200n,
  14_400n,
  21_600n,
  `0x${"00".repeat(32)}`,
  750_000_000n,
  "0x0000000000000000000000000000000000000000",
  0n,
  false,
  false,
];

interface Emitter {
  client: PublicClient;
  emit: (auctionIds: `0x${string}`[]) => void;
  fail: (error: Error) => void;
  unwatched: () => number;
}

/** A chain that hands logs to whatever `watchContractEvent` registered. */
function fakeClient(options: { readFails?: boolean } = {}): Emitter {
  let onLogs: (logs: unknown[]) => void = () => {};
  let onError: (error: Error) => void = () => {};
  let unwatched = 0;

  const client = {
    watchContractEvent: (parameters: {
      onLogs: (logs: unknown[]) => void;
      onError: (error: Error) => void;
    }) => {
      onLogs = parameters.onLogs;
      onError = parameters.onError;
      return () => {
        unwatched += 1;
      };
    },
    readContract: async () => {
      if (options.readFails) {
        throw new Error("rpc down");
      }
      return auctionRecord;
    },
  } as unknown as PublicClient;

  return {
    client,
    emit: (auctionIds) => onLogs(auctionIds.map((auctionId) => ({ args: { auctionId, requirements } }))),
    fail: (error) => onError(error),
    unwatched: () => unwatched,
  };
}

/** Starts a watcher, runs `body` against it, then aborts and waits for it to stop. */
async function watching(
  emitter: Emitter,
  body: (seen: AuctionTerms[]) => void,
): Promise<AuctionTerms[]> {
  const seen: AuctionTerms[] = [];
  const stopping = new AbortController();
  const watched = watchAuctions(
    emitter.client,
    SEALED_AUCTION,
    { signal: stopping.signal },
    (auction) => seen.push(auction),
  );

  body(seen);
  // The bid deadline is read from the chain, so every auction lands one microtask later.
  await new Promise((resolve) => setTimeout(resolve, 5));

  stopping.abort();
  await watched;

  return seen;
}

test("hands every new auction to the bidder, with its terms and its deadline", async () => {
  const emitter = fakeClient();

  const seen = await watching(emitter, () => emitter.emit([FIRST, SECOND]));

  assert.deepEqual(
    seen.map((auction) => auction.auctionId),
    [FIRST, SECOND],
  );
  assert.equal(seen[0]?.city, "Paris");
  assert.equal(seen[0]?.bidDeadline, 7_200);
});

test("keeps listening after an auction, and never fires the same one twice", async () => {
  const emitter = fakeClient();

  const seen = await watching(emitter, () => {
    emitter.emit([FIRST]);
    emitter.emit([FIRST]);
    emitter.emit([SECOND]);
  });

  assert.deepEqual(
    seen.map((auction) => auction.auctionId),
    [FIRST, SECOND],
  );
});

test("a failed read drops that auction and leaves the watcher listening", async () => {
  const emitter = fakeClient({ readFails: true });

  const seen = await watching(emitter, () => emitter.emit([FIRST]));

  assert.deepEqual(seen, []);
  assert.equal(emitter.unwatched(), 1);
});

test("a transport error does not stop the watcher", async () => {
  const emitter = fakeClient();

  const seen = await watching(emitter, () => {
    emitter.fail(new Error("connection reset"));
    emitter.emit([FIRST]);
  });

  assert.deepEqual(
    seen.map((auction) => auction.auctionId),
    [FIRST],
  );
});

test("aborting the signal unwatches exactly once", async () => {
  const emitter = fakeClient();

  await watching(emitter, () => {});

  assert.equal(emitter.unwatched(), 1);
});
