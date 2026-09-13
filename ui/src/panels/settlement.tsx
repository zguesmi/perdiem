import { formatUsdc, short } from "../auction.ts";
import { Field, Panel, TransactionLink, type PanelProps } from "./panel.tsx";

/** Who was paid, how much, and the booking that justified it. */
export function Settlement({ config, auction }: PanelProps) {
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
