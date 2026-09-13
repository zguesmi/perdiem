import { short } from "../auction.ts";
import { Field, Panel, type PanelProps } from "./panel.tsx";

/** The two things that leave the confidential handler. Everything it scored stays inside it. */
export function Enclave({ auction }: PanelProps) {
  const bookingId = auction.settlement?.bookingId;

  return (
    <Panel
      title="Enclave"
      note="Scoring and booking run inside the confidential handler. The policy is loaded there and logged nowhere."
    >
      <Field label="Bids root" value={<code>{short(auction.bidsRoot)}</code>} />
      {bookingId ? (
        <Field label="Booking" value={<code>{bookingId}</code>} />
      ) : (
        <p className="note">
          No booking yet. The contract pays only against a matching policy hash, a matching bids
          root and a booking id.
        </p>
      )}
    </Panel>
  );
}
