import type { PublicClient } from "viem";

import type { PublicRequirements } from "../../shared/policy.ts";
import { sealedAuctionAbi } from "./abi.ts";
import type { AuctionTerms } from "./tools.ts";

/** How long the watcher waits between two reads of the chain. */
const POLL_MILLISECONDS = 1_000;

/**
 * The watcher never calls the model. It listens to `SealedAuction`, hands every new auction to the
 * bidder, and keeps listening for the life of the process.
 *
 * It reads `eth_getLogs` over a block range it tracks itself, rather than subscribing or asking the
 * node for a filter. A subscription and a filter are both created asynchronously and start at
 * whatever block they land on, so an auction that opens during startup is never delivered, and a
 * supplier that misses one bids on nothing. `fromBlock` is read before the watcher starts, so the
 * window is closed by construction. A node filter is worse still: Hardhat answers
 * `eth_getFilterChanges` with an empty array for the life of some filters, which drops an auction
 * with no error anywhere, and Arc's HTTP endpoint has no `eth_newFilter` at all.
 *
 * `TermsPublished` carries every public requirement. The bid deadline is not on it, so it is read
 * from the auction record. Nothing is derived: an agent that computed an auction identifier would
 * have to hold the buyer's policy hash and payout cap, which is what it must never see.
 */
export async function watchAuctions(
  client: PublicClient,
  sealedAuction: `0x${string}`,
  options: { signal?: AbortSignal; fromBlock: bigint; pollMilliseconds?: number },
  onAuction: (auction: AuctionTerms) => void,
): Promise<void> {
  // A reorg can repeat a log. Bidding twice costs a second stake and reverts on chain, so an
  // auction fires once per process.
  const seen = new Set<string>();
  const pollMilliseconds = options.pollMilliseconds ?? POLL_MILLISECONDS;
  let nextBlock = options.fromBlock;

  while (options.signal?.aborted !== true) {
    try {
      const latest = await client.getBlockNumber({ cacheTime: 0 });

      if (latest >= nextBlock) {
        const logs = await client.getContractEvents({
          address: sealedAuction,
          abi: sealedAuctionAbi,
          eventName: "TermsPublished",
          fromBlock: nextBlock,
          toBlock: latest,
        });
        nextBlock = latest + 1n;

        for (const log of logs) {
          const { auctionId, requirements } = log.args;
          if (!auctionId || !requirements || seen.has(auctionId)) {
            continue;
          }
          seen.add(auctionId);

          // Marked seen before the read, not after. A missed bid costs nothing; a second bid costs
          // a second stake and reverts.
          void auctionTerms(client, sealedAuction, auctionId, requirements)
            .then(onAuction)
            .catch((error: Error) => console.error(`watch: ${auctionId}: ${error.message}`));
        }
      }
    } catch (error) {
      console.error(`watch: ${(error as Error).message}`);
    }

    await sleep(pollMilliseconds, options.signal);
  }
}

/** Waits, or returns early when the signal aborts, so a stop does not wait out a whole interval. */
function sleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted === true) {
      resolve();
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", stop);
      resolve();
    }, milliseconds);

    function stop(): void {
      clearTimeout(timer);
      resolve();
    }

    signal?.addEventListener("abort", stop, { once: true });
  });
}

/** The public requirements from the log, plus the bid deadline from the auction record. */
export async function auctionTerms(
  client: PublicClient,
  sealedAuction: `0x${string}`,
  auctionId: `0x${string}`,
  requirements: PublicRequirements,
): Promise<AuctionTerms> {
  const auction = await client.readContract({
    address: sealedAuction,
    abi: sealedAuctionAbi,
    functionName: "auctions",
    args: [auctionId],
  });

  return {
    auctionId,
    bidDeadline: Number(auction[3]),
    city: requirements.city,
    checkin: requirements.checkin,
    checkout: requirements.checkout,
    minStars: requirements.minStars,
    roomType: requirements.roomType,
    numberOfRooms: requirements.numberOfRooms,
    tradeDownStars: requirements.tradeDownStars,
  };
}
