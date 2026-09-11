import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeAbiParameters, encodeEventTopics, type Log, type PublicClient } from "viem";

import { sealedAuctionAbi } from "../src/abi.ts";
import type { AuctionTerms } from "../src/tools.ts";
import { watchAuctions } from "../src/watcher.ts";

const SEALED_AUCTION = "0x000000000000000000000000000000000000dEaD" as const;
const BUYER = "0x0000000000000000000000000000000000000b0b" as const;

const requirements = {
  city: "Paris",
  checkin: "2026-10-12",
  checkout: "2026-10-14",
  minStars: 4,
  roomType: "double",
  numberOfRooms: 1,
  tradeDownStars: 3,
} as const;

/** The two logs `createAuction` emits, encoded as the chain would return them. */
function auctionLogs(auctionId: `0x${string}`): Log[] {
  const created = {
    topics: encodeEventTopics({
      abi: sealedAuctionAbi,
      eventName: "AuctionCreated",
      args: { auctionId, buyer: BUYER },
    }),
    data: encodeAbiParameters(
      [{ type: "uint64" }, { type: "uint64" }, { type: "uint64" }, { type: "uint64" }],
      [1n, 7_200n, 14_400n, 21_600n],
    ),
  };
  const published = {
    topics: encodeEventTopics({
      abi: sealedAuctionAbi,
      eventName: "TermsPublished",
      args: { auctionId },
    }),
    data: encodeAbiParameters(
      [
        { type: "uint256" },
        {
          type: "tuple",
          components: [
            { name: "city", type: "string" },
            { name: "checkin", type: "string" },
            { name: "checkout", type: "string" },
            { name: "minStars", type: "uint8" },
            { name: "roomType", type: "string" },
            { name: "numberOfRooms", type: "uint8" },
            { name: "tradeDownStars", type: "uint8" },
          ],
        },
      ],
      [750_000_000n, requirements],
    ),
  };

  return [created, published].map(
    (log) => ({ ...log, address: SEALED_AUCTION, blockNumber: 1n }) as unknown as Log,
  );
}

/** A chain that answers a fixed script of `getLogs` calls, one per tick. */
function fakeClient(ticks: (Log[] | Error)[]) {
  let tick = 0;
  return {
    calls: () => tick,
    client: {
      getBlockNumber: async () => BigInt(tick + 1),
      getLogs: async () => {
        const answer = ticks[tick] ?? [];
        tick += 1;
        if (answer instanceof Error) {
          throw answer;
        }
        return answer;
      },
    } as unknown as PublicClient,
  };
}

/** Runs the watcher until it has seen `ticks` reads, then aborts it. */
async function watch(ticks: (Log[] | Error)[]): Promise<AuctionTerms[]> {
  const seen: AuctionTerms[] = [];
  const stopping = new AbortController();
  const { client, calls } = fakeClient(ticks);

  const watching = watchAuctions(
    client,
    SEALED_AUCTION,
    { fromBlock: 1n, pollMs: 1, signal: stopping.signal },
    (auction) => seen.push(auction),
  );

  while (calls() < ticks.length) {
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  stopping.abort();
  await watching;

  return seen;
}

const FIRST = `0x${"a1".repeat(32)}` as const;
const SECOND = `0x${"b2".repeat(32)}` as const;

test("hands every auction in a range to the bidder", async () => {
  const seen = await watch([[...auctionLogs(FIRST), ...auctionLogs(SECOND)]]);

  assert.deepEqual(
    seen.map((auction) => auction.auctionId),
    [FIRST, SECOND],
  );
  assert.equal(seen[0]?.city, "Paris");
  assert.equal(seen[0]?.bidDeadline, 7_200);
});

test("keeps listening after an auction, and never fires the same one twice", async () => {
  const seen = await watch([auctionLogs(FIRST), auctionLogs(FIRST), auctionLogs(SECOND)]);

  assert.deepEqual(
    seen.map((auction) => auction.auctionId),
    [FIRST, SECOND],
  );
});

test("survives a dropped remote procedure call and reads the next tick", async () => {
  const seen = await watch([new Error("connection reset"), auctionLogs(FIRST)]);

  assert.deepEqual(
    seen.map((auction) => auction.auctionId),
    [FIRST],
  );
});
