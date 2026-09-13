import { useEffect, useState } from "react";

import { explorerLink, shorter, type AuctionView, type Config } from "./auction.ts";
import { isTerminal, steps, type Row } from "./steps.ts";

/**
 * The auction as four steps, above the panels, each listing the writes that produced it.
 *
 * Done, live and pending are told apart by the rule above each step before a word is read, and the
 * live step is the one thing on the page wearing the accent.
 */
export function Stepper({ config, auction }: { config: Config; auction: AuctionView }) {
  // The chain poll is two seconds, which no countdown can be read from. This is its own tick, and
  // it stops once the auction is terminal and no deadline is ahead of it.
  const now = useSeconds(!isTerminal(auction.state));

  return (
    <ol className="stepper">
      {steps(auction, now).map((step) => (
        <li key={step.name} className={`step ${step.status}`}>
          <span className="name">{step.name}</span>
          <span className="line">{step.line}</span>
          {step.transactions.length === 0 ? (
            <span className="empty">Nothing on chain yet</span>
          ) : (
            <ol className="transactions">
              {/* Not the hash alone: Circle bundles the user operations of several wallets into
                  one transaction, so two suppliers commit under the same hash. */}
              {step.transactions.map((row) => (
                <Transaction key={`${row.label}-${row.hash}`} config={config} row={row} />
              ))}
            </ol>
          )}
        </li>
      ))}
    </ol>
  );
}

/** A deployment with no explorer shows the hash as text rather than as a dead link. */
function Transaction({ config, row }: { config: Config; row: Row }) {
  const href = explorerLink(config, row.hash);
  const hash = shorter(row.hash);

  return (
    <li className="transaction">
      <span className="what">{row.label}</span>
      <span className="where">
        #{row.blockNumber.toString()}{" "}
        {href ? (
          <a href={href} target="_blank" rel="noreferrer">
            {hash}
          </a>
        ) : (
          hash
        )}
      </span>
    </li>
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
