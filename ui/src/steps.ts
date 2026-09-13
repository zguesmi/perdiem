import {
  formatUsdc,
  short,
  type AuctionState,
  type AuctionView,
  type Transaction,
} from "./auction.ts";

/** The steps the auction walks, in order. `Timeout` replaces the last one rather than following it. */
const NAMES = ["Created", "Bidding", "Settling", "Finalized"] as const;

export type Step = {
  name: string;
  /** Done is behind, live is running, pending is ahead. The page shows this without words. */
  status: "done" | "live" | "pending";
  line: string;
  /** The on-chain writes that produced this step, in block order. */
  transactions: Row[];
};

/** One transaction row. The label names the call, or the supplier that made it. */
export type Row = Transaction & { label: string };

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
    const status = statusOf(auction, index, current, terminal);
    return {
      name: index === NAMES.length - 1 && auction.state === "Timeout" ? "Timeout" : name,
      status,
      line: line(auction, index, status, now),
      transactions: transactions(auction, index),
    };
  });
}

/**
 * A timed-out auction refunded from wherever it stopped, so the steps it never reached stay pending.
 * Marking them done would claim a scoring run that never happened.
 */
function statusOf(
  auction: AuctionView,
  index: number,
  current: number,
  terminal: boolean,
): Step["status"] {
  if (auction.state === "Timeout") {
    return index === NAMES.length - 1 || reached(auction, index) ? "done" : "pending";
  }
  if (terminal) {
    return "done";
  }
  return index < current ? "done" : index === current ? "live" : "pending";
}

function reached(auction: AuctionView, index: number): boolean {
  if (index === 1) {
    return auction.bids.length > 0;
  }
  if (index === 2) {
    return auction.claimedTransaction !== undefined;
  }
  return true;
}

/**
 * Every transaction the page knows of, under exactly one step, oldest first.
 *
 * `createAuction` emits `TermsPublished` in the same call, so the terms are a row of their own only
 * on a deployment that publishes them separately.
 */
function transactions(auction: AuctionView, index: number): Row[] {
  const rows = (): Row[] => {
    switch (index) {
      case 0:
        return [
          { label: "createAuction", ...auction.createdTransaction },
          ...(auction.termsTransaction &&
          auction.termsTransaction.hash !== auction.createdTransaction.hash
            ? [{ label: "TermsPublished", ...auction.termsTransaction }]
            : []),
        ];
      case 1:
        return auction.bids.flatMap((bid) =>
          bid.committedTransaction
            ? [
                {
                  label: bid.supplier ? short(bid.supplier) : "commit",
                  ...bid.committedTransaction,
                },
              ]
            : [],
        );
      case 2:
        return auction.claimedTransaction
          ? [{ label: "claim", ...auction.claimedTransaction }]
          : [];
      default:
        if (auction.timedOutTransaction) {
          return [{ label: "timeoutRefund", ...auction.timedOutTransaction }];
        }
        return auction.settlement
          ? [{ label: "settlement", ...auction.settlement.finalizedTransaction }]
          : [];
    }
  };

  return rows().sort((one, other) => Number(one.blockNumber - other.blockNumber));
}

function line(auction: AuctionView, index: number, status: Step["status"], now: number): string {
  switch (index) {
    case 0:
      return `${formatUsdc(auction.payoutCap)} locked in escrow`;
    case 1:
      return bidding(auction, status, now);
    case 2:
      return settling(auction, status, now);
    default:
      return settled(auction, status);
  }
}

/** The deadline runs from creation, so the countdown shows before the first commit opens bidding. */
function bidding(auction: AuctionView, status: Step["status"], now: number): string {
  const count = auction.bids.length;
  const committed = `${count} ${count === 1 ? "supplier" : "suppliers"} committed`;
  if (status === "done" || isTerminal(auction.state)) {
    return committed;
  }
  return `${committed}, ${countdown(auction.bidDeadline, now)} left`;
}

function settling(auction: AuctionView, status: Step["status"], now: number): string {
  if (status === "live") {
    return `${countdown(auction.finalizeDeadline, now)} before refunds open`;
  }
  if (auction.claimedTransaction) {
    return "Scored inside the enclave";
  }
  return isTerminal(auction.state) ? "Never claimed" : "Claimed once bidding closes";
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
