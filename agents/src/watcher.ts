import type { PublicClient } from "viem";

import { sealedAuctionAbi } from "./abi.ts";
import type { AuctionTerms } from "./tools.ts";

/** The tuple `TermsPublished` carries. */
export interface PublicRequirements {
  city: string;
  checkin: string;
  checkout: string;
  minStars: number;
  roomType: string;
  numberOfRooms: number;
  tradeDownStars: number;
}

/**
 * The watcher never calls the model. It listens to `SealedAuction`, hands every new auction to the
 * bidder, and keeps listening for the life of the process.
 *
 * `watchContractEvent` does the transport work. Over a WebSocket it opens an `eth_subscribe`
 * subscription and the chain pushes. Over HTTP it tries `eth_newFilter`, which Arc's public
 * endpoint does not answer, and falls back to polling `eth_getLogs`. Neither path is worth
 * hand-rolling, and the fallback is what makes an HTTP endpoint usable at all.
 *
 * `TermsPublished` carries every public requirement. The bid deadline is not on it, so it is read
 * from the auction record. Nothing is derived: an agent that computed an auction identifier would
 * have to hold the buyer's policy hash and payout cap, which is what it must never see.
 */
export function watchAuctions(
  client: PublicClient,
  sealedAuction: `0x${string}`,
  options: { signal?: AbortSignal },
  onAuction: (auction: AuctionTerms) => void,
): Promise<void> {
  // A subscription can replay a log after a reconnection, and a reorg can repeat one. Bidding twice
  // costs a second stake and reverts on chain, so an auction fires once per process.
  const seen = new Set<string>();

  return new Promise((resolve) => {
    const unwatch = client.watchContractEvent({
      address: sealedAuction,
      abi: sealedAuctionAbi,
      eventName: "TermsPublished",
      onError: (error) => console.error(`watch: ${error.message}`),
      onLogs: (logs) => {
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
      },
    });

    const stop = () => {
      unwatch();
      resolve();
    };
    if (options.signal?.aborted) {
      stop();
    } else {
      options.signal?.addEventListener("abort", stop, { once: true });
    }
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
