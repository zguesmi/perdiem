import { formatUsdc, short, type AuctionState, type AuctionView } from "./auction.ts";

/** The steps the auction walks, in order. `Timeout` replaces the last one rather than following it. */
const NAMES = ["Created", "Bidding", "Settling", "Finalized"] as const;

export type Step = {
  name: string;
  /** Done is behind, live is running, pending is ahead. The page shows this without words. */
  status: "done" | "live" | "pending";
  line: string;
};

/** Nothing follows either terminal state, so on both of them every step is behind. */
export function isTerminal(state: AuctionState): boolean {
  return state === "Finalized" || state === "Timeout";
}

/**
 * The auction as four steps, each carrying one line.
 *
 * A step with nothing to report says what it waits for. A blank line reads as a page that stopped
 * working, which is the one thing the demo cannot afford.
 */
export function steps(auction: AuctionView, now: number): Step[] {
  const terminal = isTerminal(auction.state);
  const current =
    auction.state === "Timeout"
      ? NAMES.length - 1
      : NAMES.findIndex((name) => name === auction.state);

  return NAMES.map((name, index) => {
    const status = terminal || index < current ? "done" : index === current ? "live" : "pending";
    return {
      name: index === NAMES.length - 1 && auction.state === "Timeout" ? "Timeout" : name,
      status,
      line: line(auction, index, status, now),
    };
  });
}

function line(auction: AuctionView, index: number, status: Step["status"], now: number): string {
  switch (index) {
    case 0:
      return `${formatUsdc(auction.payoutCap)} locked in escrow`;
    case 1:
      return bidding(auction, status, now);
    case 2:
      if (status === "live") {
        return `${countdown(auction.finalizeDeadline, now)} before refunds open`;
      }
      return status === "done" ? "Scored inside the enclave" : "Claimed once bidding closes";
    default:
      return settled(auction, status);
  }
}

function bidding(auction: AuctionView, status: Step["status"], now: number): string {
  const count = auction.bids.length;
  const committed = `${count} ${count === 1 ? "supplier" : "suppliers"} committed`;
  return status === "live" ? `${committed}, ${countdown(auction.bidDeadline, now)} left` : committed;
}

function settled(auction: AuctionView, status: Step["status"]): string {
  if (auction.state === "Timeout") {
    return `${formatUsdc(auction.payoutCap)} and every stake refunded`;
  }
  if (status !== "done" || !auction.settlement) {
    return "Paid against the policy hash";
  }
  const { winner, payout } = auction.settlement;
  return payout === 0n ? "No eligible bid" : `${short(winner)} paid ${formatUsdc(payout)}`;
}

/** `h:mm:ss` while hours are left, `m:ss` under one. It holds at zero rather than going past it. */
export function countdown(deadline: number, now: number): string {
  const left = Math.max(0, deadline - now);
  const minutes = Math.floor(left / 60) % 60;
  const seconds = String(left % 60).padStart(2, "0");
  const hours = Math.floor(left / 3600);
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`;
}
