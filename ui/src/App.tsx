import { useEffect, useState } from "react";
import type { Hex } from "viem";

import "./App.css";
import {
  createClient,
  explorerLink,
  formatTime,
  formatUsdc,
  readAuction,
  readConfig,
  short,
  type AuctionView,
  type Config,
} from "./auction.ts";

/** How long the page waits between two reads. Arc mines twice a second. */
const POLL_MILLISECONDS = 2_000;

/** Read once, at import. Misconfiguration is shown rather than thrown: a blank page names nothing. */
const configuration = ((): { config?: Config; error?: string } => {
  try {
    return { config: readConfig(import.meta.env as Record<string, string | undefined>) };
  } catch (cause) {
    return { error: (cause as Error).message };
  }
})();

/**
 * One page, five panels, top to bottom: intent, funding, bids, enclave, settlement.
 *
 * The page holds no auction state of its own. Every panel is rendered from `auctions`,
 * `commitments` and the events of the newest auction, re-read on a timer, so a reload and a
 * refresh show the same thing and there is nothing here to disagree with the chain.
 *
 * It also cannot show the private half of the policy, because it never has it: the maximum price
 * and the preferences live in the workflow secret, and only the policy hash is on chain.
 */
export default function App() {
  const { config } = configuration;
  const [auction, setAuction] = useState<AuctionView | null>();
  const [readError, setReadError] = useState<string>();
  const error = configuration.error ?? readError;

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
          setReadError(undefined);
        }
      } catch (cause) {
        if (!stopped) {
          setReadError((cause as Error).message);
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

  return (
    <main>
      <h1>Perdiem</h1>
      <p className="lede">
        Corporate hotel booking where the buyer&rsquo;s selection rules stay private and sealed bids
        guarantee the best deal.
      </p>

      {error && <p className="error">{error}</p>}

      {config && auction === undefined && !error && <p className="note">Reading the chain…</p>}
      {config && auction === null && (
        <p className="note">No auction yet. The page shows the newest one as soon as it opens.</p>
      )}

      {config && auction && (
        <>
          <p className="note">
            Auction <code>{short(auction.auctionId)}</code>, state <strong>{auction.state}</strong>
          </p>
          <Intent config={config} auction={auction} />
          <Funding config={config} auction={auction} />
          <Bids config={config} auction={auction} />
          <Enclave config={config} auction={auction} />
          <Settlement config={config} auction={auction} />
        </>
      )}
    </main>
  );
}

type PanelProps = { config: Config; auction: AuctionView };

/** The policy hash and the requirements every supplier may see. Never the policy itself. */
function Intent({ config, auction }: PanelProps) {
  return (
    <Panel title="Intent" note="The policy stays with the buyer. Only its hash reaches the chain.">
      <Field label="Policy hash" value={<code>{short(auction.policyHash)}</code>} />
      {auction.requirements ? (
        <>
          <Field
            label="Stay"
            value={`${auction.requirements.numberOfRooms} ${auction.requirements.roomType} room in ${auction.requirements.city}, ${auction.requirements.checkin} to ${auction.requirements.checkout}`}
          />
          <Field
            label="Stars"
            value={`${auction.requirements.minStars} or better, or ${auction.requirements.tradeDownStars} at a discount`}
          />
        </>
      ) : (
        <p className="note">Terms not published.</p>
      )}
      <TransactionLink config={config} label="TermsPublished" hash={auction.termsTransaction} />
    </Panel>
  );
}

/** What the buyer locked in escrow, and the call that locked it. */
function Funding({ config, auction }: PanelProps) {
  return (
    <Panel
      title="Funding"
      note="The payout cap is padded above the maximum price, so the public transfer does not publish the ceiling."
    >
      <Field label="Buyer" value={<code>{short(auction.buyer)}</code>} />
      <Field label="Payout cap" value={formatUsdc(auction.payoutCap)} />
      <Field label="Bidding closes" value={formatTime(auction.bidDeadline)} />
      <Field label="Refundable after" value={formatTime(auction.finalizeDeadline)} />
      <TransactionLink config={config} label="createAuction" hash={auction.createdTransaction} />
    </Panel>
  );
}

/** A price never appears here: only the enclave can open a sealed bid. */
function Bids({ config, auction }: PanelProps) {
  if (auction.bids.length === 0) {
    return (
      <Panel title="Bids" note="No commitment yet.">
        <p className="note">Suppliers commit on chain and seal their bid at the relay.</p>
      </Panel>
    );
  }

  return (
    <Panel
      title="Bids"
      note="A commitment binds a bid without revealing it. The sealed bid is ciphertext only the enclave can open."
    >
      {auction.bids.map((bid) => (
        <div key={bid.commitment} className="row">
          <Field
            label={bid.supplier ? short(bid.supplier) : "Unknown supplier"}
            value={
              <>
                <code>{short(bid.commitment)}</code>
                {auction.settlement?.winner === bid.supplier && <strong> winner</strong>}
              </>
            }
          />
          <p className="note">{sealedBidNote(auction.relayReachable, bid.sealedBytes)}</p>
          <TransactionLink config={config} label="commit" hash={bid.committedTransaction} />
        </div>
      ))}
    </Panel>
  );
}

/** What the enclave did, as the chain saw it. The scoring itself publishes nothing. */
function Enclave({ config, auction }: PanelProps) {
  return (
    <Panel
      title="Enclave"
      note="Scoring runs inside the confidential handler. The policy is loaded there and logged nowhere."
    >
      <Field label="State" value={auction.state} />
      <Field label="Bids root" value={<code>{short(auction.bidsRoot)}</code>} />
      {auction.claimedTransaction ? (
        <TransactionLink config={config} label="claim" hash={auction.claimedTransaction} />
      ) : (
        <p className="note">
          Not claimed yet. The workflow claims the auction after bidding closes.
        </p>
      )}
    </Panel>
  );
}

/** Who was paid, how much, and the booking that justified it. */
function Settlement({ config, auction }: PanelProps) {
  if (auction.timedOutTransaction) {
    return (
      <Panel title="Settlement" note="No settlement landed in time.">
        <Field label="Refunded" value={formatUsdc(auction.payoutCap)} />
        <TransactionLink config={config} label="timeoutRefund" hash={auction.timedOutTransaction} />
      </Panel>
    );
  }

  if (!auction.settlement) {
    return (
      <Panel title="Settlement" note="Not settled yet.">
        <p className="note">
          The contract pays only against a matching policy hash, a matching bids root and a booking
          id.
        </p>
      </Panel>
    );
  }

  const { winner, payout, bookingId, finalizedTransaction } = auction.settlement;
  const noWinner = payout === 0n;

  return (
    <Panel
      title="Settlement"
      note="The contract rechecks the policy hash and the bids root before it pays anyone."
    >
      <Field
        label="Winner"
        value={
          noWinner ? "None. No eligible bid, or the booking failed." : <code>{short(winner)}</code>
        }
      />
      <Field label="Payout" value={formatUsdc(payout)} />
      <Field label="Refund to buyer" value={formatUsdc(auction.payoutCap - payout)} />
      {bookingId && <Field label="Booking" value={<code>{bookingId}</code>} />}
      <TransactionLink config={config} label="settlement" hash={finalizedTransaction} />
    </Panel>
  );
}

/** A relay that never answered says nothing about whether a supplier sealed a bid. */
function sealedBidNote(relayReachable: boolean, sealedBytes?: number): string {
  if (!relayReachable) {
    return "The relay did not answer.";
  }
  return sealedBytes === undefined
    ? "No sealed bid at the relay."
    : `${sealedBytes} bytes of ciphertext at the relay.`;
}

function Panel({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2>{title}</h2>
      <p className="note">{note}</p>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <p className="field">
      <span className="label">{label}</span>
      <span>{value}</span>
    </p>
  );
}

/** A deployment with no explorer shows the hash as text rather than a dead link. */
function TransactionLink({ config, label, hash }: { config: Config; label: string; hash?: Hex }) {
  if (!hash) {
    return null;
  }
  const href = explorerLink(config, hash);

  return (
    <p className="field">
      <span className="label">{label}</span>
      <span>
        {href ? (
          <a href={href} target="_blank" rel="noreferrer">
            <code>{short(hash)}</code>
          </a>
        ) : (
          <code>{short(hash)}</code>
        )}
      </span>
    </p>
  );
}
