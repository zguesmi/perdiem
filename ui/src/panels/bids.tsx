import { short } from "../auction.ts";
import { Field, Panel, type PanelProps } from "./panel.tsx";

/** A price never appears here: only the enclave can open a sealed bid. */
export function Bids({ auction }: PanelProps) {
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
        </div>
      ))}
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
