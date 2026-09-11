import { parseEventLogs, type PublicClient } from "viem";

import { sealedAuctionAbi } from "./abi.ts";
import type { AuctionTerms } from "./tools.ts";

/**
 * The watcher never calls the model. It listens to `SealedAuction`, hands every new auction to the
 * bidder, and keeps listening. One process, one supplier, every auction that opens while it runs.
 *
 * The auction identifier comes from the log. An agent that derived it would have to hold the
 * buyer's policy hash and the payout cap, which is exactly what it is not allowed to see.
 */

/** How long the watcher waits between two reads of the chain head. */
const DEFAULT_POLL_MS = 3_000;

/** Every auction opened in a block range, in the order the chain reports it. */
export async function auctionsInRange(
  client: PublicClient,
  sealedAuction: `0x${string}`,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<AuctionTerms[]> {
  const logs = parseEventLogs({
    abi: sealedAuctionAbi,
    logs: await client.getLogs({ address: sealedAuction, fromBlock, toBlock }),
  });

  // `createAuction` emits both events in one transaction, so a pair is always whole inside a range.
  return logs.flatMap((created) => {
    if (created.eventName !== "AuctionCreated") {
      return [];
    }
    const terms = logs.find(
      (log) => log.eventName === "TermsPublished" && log.args.auctionId === created.args.auctionId,
    );
    if (terms?.eventName !== "TermsPublished") {
      return [];
    }

    const { requirements } = terms.args;
    return [
      {
        auctionId: created.args.auctionId,
        bidDeadline: Number(created.args.bidDeadline),
        city: requirements.city,
        checkin: requirements.checkin,
        checkout: requirements.checkout,
        minStars: requirements.minStars,
        roomType: requirements.roomType,
        numberOfRooms: requirements.numberOfRooms,
        tradeDownStars: requirements.tradeDownStars,
      },
    ];
  });
}

/**
 * Runs until the signal aborts. `onAuction` is called once per auction: a rescan of the same block
 * never fires twice, and a slow bid never stops the watcher from seeing the next auction.
 *
 * An RPC failure is logged and retried on the next tick. A watcher that exits on a dropped
 * connection is a supplier that silently stops bidding.
 */
export async function watchAuctions(
  client: PublicClient,
  sealedAuction: `0x${string}`,
  options: { fromBlock: bigint; pollMs?: number; signal?: AbortSignal },
  onAuction: (auction: AuctionTerms) => void,
): Promise<void> {
  let fromBlock = options.fromBlock;
  const seen = new Set<string>();

  for (;;) {
    if (options.signal?.aborted) {
      return;
    }

    try {
      const toBlock = await client.getBlockNumber();
      if (toBlock >= fromBlock) {
        for (const auction of await auctionsInRange(client, sealedAuction, fromBlock, toBlock)) {
          if (!seen.has(auction.auctionId)) {
            seen.add(auction.auctionId);
            onAuction(auction);
          }
        }
        fromBlock = toBlock + 1n;
      }
    } catch (error) {
      console.error(`watch: ${error instanceof Error ? error.message : String(error)}`);
    }

    await new Promise((resolve) => setTimeout(resolve, options.pollMs ?? DEFAULT_POLL_MS));
  }
}
