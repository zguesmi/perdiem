import { parseEventLogs, type PublicClient } from "viem";

import { sealedAuctionAbi } from "./abi.ts";
import type { AuctionTerms } from "./tools.ts";

/**
 * The watcher never calls the model. It reads `AuctionCreated` and `TermsPublished`, hands the
 * terms over once, and that is all it does.
 *
 * The identifier comes from the log. An agent that derived it would have to hold the buyer's policy
 * hash and the payout cap, which is exactly what it is not allowed to see.
 */
export async function nextAuction(
  client: PublicClient,
  sealedAuction: `0x${string}`,
  options: { fromBlock: bigint; pollMs?: number; signal?: AbortSignal },
): Promise<AuctionTerms> {
  let fromBlock = options.fromBlock;

  for (;;) {
    options.signal?.throwIfAborted();

    const toBlock = await client.getBlockNumber();
    if (toBlock >= fromBlock) {
      const logs = parseEventLogs({
        abi: sealedAuctionAbi,
        logs: await client.getLogs({ address: sealedAuction, fromBlock, toBlock }),
      });

      const created = logs.find((log) => log.eventName === "AuctionCreated");
      const terms = logs.find(
        (log) => log.eventName === "TermsPublished" && log.args.auctionId === created?.args.auctionId,
      );

      if (created && terms && terms.eventName === "TermsPublished") {
        const { requirements } = terms.args;
        return {
          auctionId: created.args.auctionId,
          bidDeadline: Number(created.args.bidDeadline),
          city: requirements.city,
          checkin: requirements.checkin,
          checkout: requirements.checkout,
          minStars: requirements.minStars,
          roomType: requirements.roomType,
          numberOfRooms: requirements.numberOfRooms,
          tradeDownStars: requirements.tradeDownStars,
        };
      }

      fromBlock = toBlock + 1n;
    }

    await new Promise((resolve) => setTimeout(resolve, options.pollMs ?? 3_000));
  }
}
