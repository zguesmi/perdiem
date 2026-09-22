import { useEffect, useState } from "react";
import type { Address } from "viem";

import {
  createClient,
  readAuction,
  readBalance,
  readUsdc,
  type AuctionView,
  type Config,
} from "./auction.ts";

/**
 * How long the page waits between two reads. Arc mines twice a second, and one read costs eleven
 * requests, so a shorter interval answers `rate limit exceeded` rather than the chain.
 */
const POLL_MILLISECONDS = 5_000;

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
    // A balance the chain would not answer for this poll keeps the figure the last one read.
    let lastBalances: Map<string, bigint> | undefined;

    // Each poll schedules the next one only after it finishes. On an interval a slow read can
    // resolve after a fast later one and walk the panels backwards, from settled to still bidding.
    const poll = async (): Promise<void> => {
      try {
        const next = await readAuction(client, config, lastBalances);
        if (!stopped) {
          lastBalances = next?.balances;
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

/**
 * The travel desk's USDC, polled on its own.
 *
 * Apart from `useAuction` because the desk holds a balance before it opens anything: the auction
 * read answers `null` until an auction exists, and one whole read has to land before it answers at
 * all. Both leave the headline figure blank on a page that could already show it.
 *
 * `buyer` is the address an auction named, which wins over the configured one: the auction is what
 * the chain settled on, and configuration is only what the page was told.
 */
export function useBuyerBalance(config?: Config, buyer?: Address): bigint | undefined {
  const [balance, setBalance] = useState<bigint>();
  const address = buyer ?? config?.buyer;

  useEffect(() => {
    if (!config || !address) {
      return;
    }
    const client = createClient(config);
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async (): Promise<void> => {
      try {
        const usdc = await readUsdc(client, config);
        const read = await readBalance(client, usdc, address);
        // A read the chain would not answer keeps the figure the last one showed.
        if (!stopped && read !== undefined) {
          setBalance(read);
        }
      } catch {
        // The balance is one figure on a page that reads the rest for itself. A failure here shows
        // the last figure rather than an error the auction panels would contradict.
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
  }, [config, address]);

  return balance;
}
