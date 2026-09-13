import { useEffect, useState } from "react";

import type { AuctionView } from "./auction.ts";
import { isTerminal, steps } from "./steps.ts";

/**
 * The auction as four steps, above the panels.
 *
 * Done, live and pending are told apart by the rule above each step before a word is read, and the
 * live step is the one thing on the page wearing the accent.
 */
export function Stepper({ auction }: { auction: AuctionView }) {
  // The chain poll is two seconds, which no countdown can be read from. This is its own tick, and
  // it stops once the auction is terminal and no deadline is ahead of it.
  const now = useSeconds(!isTerminal(auction.state));

  return (
    <ol className="stepper">
      {steps(auction, now).map((step) => (
        <li key={step.name} className={`step ${step.status}`}>
          <span className="name">{step.name}</span>
          <span className="line">{step.line}</span>
        </li>
      ))}
    </ol>
  );
}

/** The wall clock in seconds, re-read every second while `running`. */
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
