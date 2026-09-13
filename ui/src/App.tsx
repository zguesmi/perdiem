import { useEffect, useState } from "react";

import { readConfig, shorter, usdcAmount, type AuctionView, type Config } from "./auction.ts";
import { readBooking, type Booking } from "./booking.ts";
import { Detail } from "./detail.tsx";
import { More } from "./more.tsx";
import { Request } from "./request.tsx";
import { Stepper } from "./stepper.tsx";
import {
  follow,
  isTerminal,
  lastLine,
  liveStep,
  steps,
  type Following,
  type StepKey,
} from "./steps.ts";
import { useAuction } from "./use-auction.ts";

/** Read once, at import. Misconfiguration is shown rather than thrown: a blank page names nothing. */
const configuration = ((): { config?: Config; error?: string } => {
  try {
    return { config: readConfig(import.meta.env as Record<string, string | undefined>) };
  } catch (cause) {
    return { error: (cause as Error).message };
  }
})();

/**
 * One column, read top to bottom: what the desk can spend, what it is asking for, and where the
 * auction that answers it has got to.
 *
 * The page holds no auction state of its own. Everything below the request card is rendered from
 * what `useAuction` re-read, so a reload and a refresh show the same thing and there is nothing
 * here to disagree with the chain.
 *
 * It also cannot show the private half of the policy, because it never has it: the maximum price
 * and the preferences stay with the buyer, and only the policy hash is on chain.
 */
export default function App() {
  const { config } = configuration;
  const { auction, error: readError } = useAuction(config);
  const error = configuration.error ?? readError;

  const [following, setFollowing] = useState<Following>({ expanded: true });
  const [click, setClick] = useState<{ at?: StepKey; key: StepKey }>();
  const booking = useBooking(auction?.settlement?.bookingId);
  const live = auction ? liveStep(auction) : undefined;
  const now = useSeconds(auction ? !isTerminal(auction.state) : false);

  // The first sight of an auction decides whether it is still the page's subject, and nothing
  // stores that. Adjusting it here rather than in an effect keeps the page one render behind
  // nothing: React re-runs this component before it paints either version.
  if (auction && following.auctionId !== auction.auctionId) {
    setFollowing(follow(following, auction));
  }

  // A click is read against the step that was running when it was made, so the selection returns
  // to the auction as soon as the auction advances.
  const selected = click && click.at === live ? click.key : live;
  const shown = auction ? steps(auction, { now, booking }) : [];
  const step = shown.find((one) => one.key === selected) ?? shown.find((one) => one.key === live);
  const open = auction !== null && auction !== undefined && following.expanded;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="mark">&#9635;</span>
          <div>
            <h1>Perdiem</h1>
            <p>
              Your selection criteria stay private. Hotels bid blind against them to guarantee the
              best deal.
            </p>
          </div>
        </div>
        {config?.networkName && (
          <span className="pill">
            <i className="dot" />
            {config.networkName}
          </span>
        )}
      </header>

      {error && <p className="error">{error}</p>}

      {config && (
        <>
          <section className="stats">
            <article className="card stat">
              <div className="eyebrow">Travel desk wallet</div>
              <div className="value">
                <Usdc amount={auction ? deskBalance(auction) : undefined} />
              </div>
              <div className="sub">
                Organization wallet{auction && ` · ${shorter(auction.buyer)}`}
              </div>
            </article>
            <article className="card stat">
              <div className="eyebrow">Maximum stay budget</div>
              <div className="value">
                <Usdc amount={usdcAmount(config.maxPayoutCap)} />
              </div>
              <div className="sub">
                Finance caps every stay here. A larger request is refused unsigned.
              </div>
            </article>
          </section>

          <Request config={config} />
        </>
      )}

      {config && auction && !following.expanded && (
        <Last auction={auction} booking={booking} onView={() => setFollowing(expand(true))} />
      )}

      {config && open && auction && (
        <>
          <div className="status-head">
            <span className="eyebrow">Auction status</span>
            <span className="hint">Click a step to read it again</span>
            {isTerminal(auction.state) && (
              <button
                className="quiet hide"
                type="button"
                onClick={() => setFollowing(expand(false))}
              >
                Hide
              </button>
            )}
          </div>

          <Stepper
            steps={shown}
            selected={selected}
            onSelect={(key) => setClick({ at: live, key })}
          />
          {step && <Detail key={step.key} step={step} config={config} />}
          <More config={config} auction={auction} />
        </>
      )}
    </div>
  );
}

/** A finished auction is not the page's subject any more: one line, and a way back into it. */
function Last({
  auction,
  booking,
  onView,
}: {
  auction: AuctionView;
  booking?: Booking;
  onView: () => void;
}) {
  const { label, line } = lastLine(auction, booking);

  return (
    <section className="card last">
      <div>
        <span className="eyebrow">{label}</span>
        <p>{line}</p>
      </div>
      <button className="quiet" type="button" onClick={onView}>
        View
      </button>
    </section>
  );
}

/** An em dash where a figure would be: the page has not read one, rather than read a zero. */
function Usdc({ amount }: { amount?: string }) {
  return amount === undefined ? (
    <>&mdash;</>
  ) : (
    <>
      {amount} <span className="unit">USDC</span>
    </>
  );
}

function expand(expanded: boolean): (previous: Following) => Following {
  return (previous) => ({ ...previous, expanded });
}

function deskBalance(auction: AuctionView): string | undefined {
  const held = auction.balances.get(auction.buyer.toLowerCase());
  return held === undefined ? undefined : usdcAmount(held);
}

/** The booking record, once per booking id. It never changes, so one read answers every poll. */
function useBooking(bookingId?: string): Booking | undefined {
  const [read, setRead] = useState<{ bookingId: string; booking?: Booking }>();

  useEffect(() => {
    if (!bookingId) {
      return;
    }
    let current = true;
    void readBooking(bookingId).then((booking) => {
      if (current) {
        setRead({ bookingId, booking });
      }
    });
    return () => {
      current = false;
    };
  }, [bookingId]);

  // By identifier, so the previous auction's hotel is never shown against this one's booking.
  return read && read.bookingId === bookingId ? read.booking : undefined;
}

/** The wall clock in seconds, re-read every second while `running`. Only countdowns need it. */
function useSeconds(running: boolean): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    if (!running) {
      return;
    }
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1_000);
    return () => clearInterval(timer);
  }, [running]);

  return now;
}
