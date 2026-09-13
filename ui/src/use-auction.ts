import { useEffect, useState } from "react";

import { createClient, readAuction, type AuctionView, type Config } from "./auction.ts";

/** How long the page waits between two reads. Arc mines twice a second. */
const POLL_MILLISECONDS = 2_000;

/**
 * The newest auction, re-read on a timer.
 *
 * `undefined` while the first read is in flight, `null` once the chain has answered that no auction
 * exists yet. The hook owns no other state: every panel is rendered from what the chain returned,
 * so a reload and a refresh show the same thing.
 */
export function useAuction(config?: Config): {
  auction: AuctionView | null | undefined;
  error?: string;
} {
  const [auction, setAuction] = useState<AuctionView | null>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!config) {
      return;
    }
    const client = createClient(config);
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    // Each poll schedules the next one only after it finishes. On an interval a slow read can
    // resolve after a fast later one and walk the panels backwards, from settled to still bidding.
    const poll = async (): Promise<void> => {
      try {
        const next = await readAuction(client, config);
        if (!stopped) {
          setAuction(next);
          setError(undefined);
        }
      } catch (cause) {
        if (!stopped) {
          setError((cause as Error).message);
        }
      }
      if (!stopped) {
        timer = setTimeout(() => void poll(), POLL_MILLISECONDS);
      }
    };

    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [config]);

  return { auction, error };
}
