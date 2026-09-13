import {
  formatUsdc,
  short,
  shorter,
  type AuctionState,
  type AuctionView,
  type BidRow,
  type Transaction,
} from "./auction.ts";
import { bookingPath, hotelPath, type Booking } from "./booking.ts";

/** The linear path. Timeout is off it: a refund replaces the settlement, it never follows one. */
const PATH = ["created", "bidding", "settling", "finalized"] as const;

export type StepKey = (typeof PATH)[number] | "timeout";

/** Done is behind, live is running, refunded is the way out, skipped is what the refund cut short. */
export type Status = "done" | "live" | "refunded" | "skipped" | "pending";

export type Step = {
  key: StepKey;
  name: string;
  /** What the marker shows: a position on the path, or the sign that the auction left it. */
  mark: string;
  /** Whether the auction ever got here. Only a reached step can be selected and read. */
  reached: boolean;
  status: Status;
  /** What the marker carries beside its name, in brackets. Only the timeout step has one. */
  note?: string;
  /** One sentence, in the tense the step is in. */
  headline: string;
  /** Whether the headline reports an auction that paid nobody. It is marked, not coloured red. */
  warn?: boolean;
  /** The mechanism behind the headline. Nothing on the page depends on it being read. */
  tip: string;
  items: Item[];
};

/** A key and a value, or a supplier's own block, which carries four facts rather than one. */
export type Item =
  | { kind: "row"; label: string; value: Value }
  | {
      kind: "bid";
      address: string;
      tag: string;
      /** The winner's tag is green. */
      win: boolean;
      note: string;
      code?: string;
      transaction?: Transaction;
    };

export type Value =
  | { kind: "text"; text: string; mono: boolean }
  | { kind: "code"; text: string }
  | { kind: "tx"; transaction: Transaction }
  | { kind: "link"; href: string; text: string; code: boolean };

const NAMES: Record<StepKey, { name: string; mark: string }> = {
  created: { name: "Created", mark: "1" },
  bidding: { name: "Bidding", mark: "2" },
  settling: { name: "Settling", mark: "3" },
  finalized: { name: "Finalized", mark: "4" },
  timeout: { name: "Timeout", mark: "↺" },
};

/** Nothing follows either of these, so an auction in one of them is history. */
export function isTerminal(state: AuctionState): boolean {
  return state === "Finalized" || state === "Timeout";
}

/** The step the auction is on. The page follows it, and a click on another one overrides until it moves. */
export function liveStep(auction: AuctionView): StepKey {
  switch (auction.state) {
    case "Timeout":
      return "timeout";
    case "Finalized":
      return "finalized";
    case "Settling":
      return "settling";
    case "Bidding":
      return "bidding";
    default:
      return "created";
  }
}

/**
 * Whether the auction is still the page's subject.
 *
 * A load that finds an auction already finished collapses it to one line: the reader arrived after
 * it ended, and the box for the next request is what they came for. An auction that finishes while
 * the page is open stays open, because that reader watched it happen. The decision is taken once,
 * the first time an auction is seen, and nothing stores it.
 */
export type Following = { auctionId?: string; expanded: boolean };

export function follow(previous: Following, auction: AuctionView): Following {
  return previous.auctionId === auction.auctionId
    ? previous
    : { auctionId: auction.auctionId, expanded: !isTerminal(auction.state) };
}

/** The one line a collapsed auction leaves behind. */
export function lastLine(auction: AuctionView, booking?: Booking): { label: string; line: string } {
  if (auction.state === "Timeout") {
    return {
      label: "Last auction",
      line: `Refunded in full. ${formatUsdc(auction.payoutCap)} returned to the travel desk.`,
    };
  }
  const settlement = auction.settlement;
  if (!settlement || settlement.payout === 0n) {
    return { label: "Last auction", line: "No bid qualified. Refunded in full." };
  }
  return {
    label: "Last booking",
    line: `${booking?.hotelName ?? settlement.bookingId} · ${formatUsdc(settlement.payout)}`,
  };
}

/** The five steps, in order, each carrying everything its detail card shows. */
export function steps(
  auction: AuctionView,
  { now, booking }: { now: number; booking?: Booking },
): Step[] {
  return [...PATH, "timeout" as const].map((key, index) => {
    const status = statusOf(auction, key, index);
    return {
      key,
      ...NAMES[key],
      reached: status !== "pending" && status !== "skipped",
      status,
      note: note(auction, key, now),
      ...detail(auction, key, status, now, booking),
    };
  });
}

/**
 * A timed-out auction refunded from wherever it stopped, so the steps it never reached stay
 * unreached. Marking them done would claim a scoring run that never happened.
 */
function statusOf(auction: AuctionView, key: StepKey, index: number): Status {
  if (auction.state === "Timeout") {
    if (key === "timeout") {
      return "refunded";
    }
    return reachedBeforeTimeout(auction, index) ? "done" : "skipped";
  }
  if (key === "timeout") {
    return "pending";
  }

  const current = PATH.indexOf(liveStep(auction) as (typeof PATH)[number]);
  if (index !== current) {
    return index < current ? "done" : "pending";
  }
  return auction.state === "Finalized" ? "done" : "live";
}

/** The chain's own evidence that the auction got this far before anyone refunded it. */
function reachedBeforeTimeout(auction: AuctionView, index: number): boolean {
  switch (index) {
    case 0:
      return true;
    case 1:
      return auction.bids.length > 0;
    case 2:
      return auction.claimedTransaction !== undefined;
    default:
      return false;
  }
}

/**
 * The time left before the refund opens, on the timeout step alone.
 *
 * A terminal auction carries none: nothing follows `Finalized` or `Timeout`, so counting down to a
 * refund that can no longer be taken would name a deadline that stopped mattering.
 */
function note(auction: AuctionView, key: StepKey, now: number): string | undefined {
  return key === "timeout" && !isTerminal(auction.state)
    ? `(${countdown(auction.finalizeDeadline, now)})`
    : undefined;
}

function detail(
  auction: AuctionView,
  key: StepKey,
  status: Status,
  now: number,
  booking?: Booking,
): { headline: string; tip: string; items: Item[]; warn?: boolean } {
  switch (key) {
    case "created":
      return created(auction, status, now);
    case "bidding":
      return bidding(auction, status, now);
    case "settling":
      return settling(auction, status, now);
    case "finalized":
      return finalized(auction, booking);
    default:
      return timedOut(auction);
  }
}

function created(auction: AuctionView, status: Status, now: number) {
  const requirements = auction.requirements;
  return {
    headline: "The booking rules are locked and the escrow is funded.",
    tip: "The chain stores a hash of the rules. The budget and the preferences are encrypted and readable only by the CRE enclave.",
    items: [
      row("Auction", code(short(auction.auctionId))),
      row("Policy hash", code(short(auction.policyHash))),
      ...(requirements
        ? [
            row(
              "Stay",
              text(
                `${requirements.numberOfRooms} ${requirements.roomType} room in ${requirements.city}, ${requirements.checkin} to ${requirements.checkout}`,
              ),
            ),
            row(
              "Stars",
              text(
                `${requirements.minStars} or better, or ${requirements.tradeDownStars} at a discount`,
              ),
            ),
          ]
        : []),
      row("Locked in escrow", text(formatUsdc(auction.payoutCap), true)),
      row("Transaction", transaction(auction.createdTransaction)),
      ...closing(auction, status, now),
    ],
  };
}

function bidding(auction: AuctionView, status: Status, now: number) {
  const count = auction.bids.length;
  return {
    headline: `${count} ${count === 1 ? "supplier" : "suppliers"} staked and sealed a bid.`,
    tip: "Each supplier writes a hash of its bid on chain and encrypts the bid with the enclave key. No supplier can read another's price.",
    items: [
      ...auction.bids.map(
        (bid): Item => ({
          kind: "bid",
          address: short(bid.supplier ?? bid.commitment),
          tag: sealedTag(auction, bid),
          win: false,
          note: "commitment",
          code: shorter(bid.commitment),
          transaction: bid.committedTransaction,
        }),
      ),
      ...closing(auction, status, now),
    ],
  };
}

function settling(auction: AuctionView, status: Status, now: number) {
  return {
    headline:
      status === "live"
        ? "The enclave claimed the auction and is scoring the sealed bids and booking the winner."
        : "The enclave claimed the auction and scored the sealed bids inside the confidential handler.",
    tip: "The enclave decrypts the rules and the bids inside the confidential handler. Only the winner, the payout and the booking reference come back out.",
    items: [
      ...(auction.claimedTransaction
        ? [row("Claim", transaction(auction.claimedTransaction))]
        : []),
      ...(status === "live"
        ? [row("Refunds open in", text(countdown(auction.finalizeDeadline, now), true))]
        : []),
    ],
  };
}

function finalized(auction: AuctionView, booking?: Booking) {
  const settlement = auction.settlement;
  const won = settlement !== undefined && settlement.payout > 0n;
  const payout = settlement?.payout ?? 0n;

  return {
    headline: won
      ? "The winning bid is paid and the room is booked."
      : "No bid qualified, everyone is refunded",
    warn: !won,
    tip: "The contract pays only if the settlement carries the correct policy hash, the same commitments, and a booking reference.",
    items: [
      ...(won && settlement
        ? [
            {
              kind: "bid" as const,
              address: short(settlement.winner),
              tag: "winner",
              win: true,
              note: `paid ${formatUsdc(payout)}`,
            },
          ]
        : []),
      row("Refunded to the travel desk", text(formatUsdc(auction.payoutCap - payout), true)),
      ...stakes(auction),
      ...(won && settlement
        ? [
            row(
              "Hotel",
              booking
                ? linkTo(hotelPath(booking.hotelId), booking.hotelName)
                : text("Reading the booking…"),
            ),
            row("Booking", linkTo(bookingPath(settlement.bookingId), settlement.bookingId, true)),
          ]
        : []),
      ...(settlement ? [row("Settlement", transaction(settlement.finalizedTransaction))] : []),
    ],
  };
}

function timedOut(auction: AuctionView) {
  return {
    headline: "No settlement arrived in time. Everything is refunded.",
    tip: "Anyone can refund an auction after the finalize deadline if it has not been settled.",
    items: [
      row("Refunded to the travel desk", text(formatUsdc(auction.payoutCap), true)),
      ...stakes(auction),
      ...(auction.timedOutTransaction
        ? [row("Transaction", transaction(auction.timedOutTransaction))]
        : []),
    ],
  };
}

/**
 * The bid deadline, on whichever of the first two steps is running.
 *
 * It runs from creation, so it is already counting down before the first commit opens bidding.
 */
function closing(auction: AuctionView, status: Status, now: number): Item[] {
  return status === "live"
    ? [row("Bidding closes in", text(countdown(auction.bidDeadline, now), true))]
    : [];
}

/** Every stake comes back on every terminal path, so the count is the whole fact. */
function stakes(auction: AuctionView): Item[] {
  const count = auction.bids.length;
  return count === 0 ? [] : [row("Stakes", text(`${count} returned`))];
}

/** A relay that never answered says nothing about whether a supplier sealed a bid. */
function sealedTag(auction: AuctionView, bid: BidRow): string {
  if (bid.sealedBytes !== undefined) {
    return `${bid.sealedBytes} B sealed`;
  }
  return auction.relayReachable ? "not sealed" : "relay silent";
}

function row(label: string, value: Value): Item {
  return { kind: "row", label, value };
}

function text(value: string, mono = false): Value {
  return { kind: "text", text: value, mono };
}

function code(value: string): Value {
  return { kind: "code", text: value };
}

function transaction(value: Transaction): Value {
  return { kind: "tx", transaction: value };
}

function linkTo(href: string, value: string, asCode = false): Value {
  return { kind: "link", href, text: value, code: asCode };
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
