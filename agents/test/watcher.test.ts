import assert from "node:assert/strict";
import { test } from "node:test";
import type { PublicClient } from "viem";

import type { AuctionTerms } from "../src/tools.ts";
import type { PublicRequirements } from "../../shared/policy.ts";
import { watchAuctions } from "../src/watcher.ts";

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

interface Chain {
  client: PublicClient;
  /** Mines a block carrying these auctions, as the watcher's next read will see it. */
  mine: (auctionIds: `0x${string}`[]) => void;
  reads: () => { fromBlock: bigint; toBlock: bigint }[];
  failNextRead: () => void;
}

/** A chain the watcher reads with `getBlockNumber` and `getContractEvents`. */
function fakeChain(options: { auctionReadFails?: boolean } = {}): Chain {
  const blocks = new Map<bigint, `0x${string}`[]>();
  const reads: { fromBlock: bigint; toBlock: bigint }[] = [];
  let latest = 41n;
  let failNext = false;

  const client = {
    getBlockNumber: async () => {
      if (failNext) {
        failNext = false;
        throw new Error("connection reset");
      }
      return latest;
    },
    getContractEvents: async (parameters: { fromBlock: bigint; toBlock: bigint }) => {
      reads.push({ fromBlock: parameters.fromBlock, toBlock: parameters.toBlock });
      const logs = [];

      for (let block = parameters.fromBlock; block <= parameters.toBlock; block += 1n) {
        for (const auctionId of blocks.get(block) ?? []) {
          logs.push({ args: { auctionId, requirements } });
        }
      }

      return logs;
    },
    readContract: async () => {
      if (options.auctionReadFails) {
        throw new Error("rpc down");
      }
      return auctionRecord;
    },
  } as unknown as PublicClient;

  return {
    client,
    mine: (auctionIds) => {
      latest += 1n;
      blocks.set(latest, auctionIds);
    },
    reads: () => reads,
    failNextRead: () => {
      failNext = true;
    },
  };
}

/** Starts a watcher, runs `body` against it, then aborts and waits for it to stop. */
async function watching(
  chain: Chain,
  body: (seen: AuctionTerms[]) => void | Promise<void>,
): Promise<AuctionTerms[]> {
  const seen: AuctionTerms[] = [];
  const stopping = new AbortController();
  const watched = watchAuctions(
    chain.client,
    SEALED_AUCTION,
    { signal: stopping.signal, fromBlock: 41n, pollMilliseconds: 1 },
    (auction) => seen.push(auction),
  );

  await body(seen);
  await settle();

  stopping.abort();
  await watched;

  return seen;
}

/** Lets the poll loop run a few times, since each auction costs one further read. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

test("reads from the block it was given, not from wherever the first poll lands", async () => {
  // An auction opened while the agent was still starting has to arrive all the same. The block the
  // caller read before the watcher started is what closes that window.
  const chain = fakeChain();

  const seen = await watching(chain, () => {});

  assert.deepEqual(seen, []);
  assert.equal(chain.reads()[0]?.fromBlock, 41n);
});

test("hands every new auction to the bidder, with its terms and its deadline", async () => {
  const chain = fakeChain();

  const seen = await watching(chain, () => chain.mine([FIRST, SECOND]));

  assert.deepEqual(
    seen.map((auction) => auction.auctionId),
    [FIRST, SECOND],
  );
  assert.equal(seen[0]?.city, "Paris");
  assert.equal(seen[0]?.bidDeadline, 7_200);
});

test("delivers an auction mined after the watcher started", async () => {
  // The failure this replaces: the node answered a filter with an empty array for the life of the
  // process, so the agent heard nothing and never bid.
  const chain = fakeChain();

  const seen = await watching(chain, async () => {
    await settle();
    chain.mine([FIRST]);
  });

  assert.deepEqual(
    seen.map((auction) => auction.auctionId),
    [FIRST],
  );
});

test("reads each block once and never fires the same auction twice", async () => {
  const chain = fakeChain();

  const seen = await watching(chain, async () => {
    chain.mine([FIRST]);
    await settle();
    chain.mine([SECOND]);
  });

  assert.deepEqual(
    seen.map((auction) => auction.auctionId),
    [FIRST, SECOND],
  );
  const overlapping = chain
    .reads()
    .some((read, index, reads) => index > 0 && read.fromBlock <= (reads[index - 1]?.toBlock ?? 0n));
  assert.equal(overlapping, false);
});

test("a failed read drops that auction and leaves the watcher listening", async () => {
  const chain = fakeChain({ auctionReadFails: true });

  const seen = await watching(chain, async () => {
    chain.mine([FIRST]);
    await settle();
    chain.mine([SECOND]);
  });

  assert.deepEqual(seen, []);
  assert.equal(chain.reads().length >= 2, true);
});

test("a transport error does not stop the watcher", async () => {
  const chain = fakeChain();

  const seen = await watching(chain, async () => {
    chain.failNextRead();
    await settle();
    chain.mine([FIRST]);
  });

  assert.deepEqual(
    seen.map((auction) => auction.auctionId),
    [FIRST],
  );
});

test("aborting the signal stops the watcher without waiting out the interval", async () => {
  const chain = fakeChain();
  const stopping = new AbortController();
  const watched = watchAuctions(
    chain.client,
    SEALED_AUCTION,
    { signal: stopping.signal, fromBlock: 41n, pollMilliseconds: 60_000 },
    () => {},
  );

  await settle();
  stopping.abort();

  await watched;
});
