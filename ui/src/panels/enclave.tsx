import { short } from "../auction.ts";
import { Field, Panel, type PanelProps } from "./panel.tsx";

/** What the enclave did, as the chain saw it. The scoring itself publishes nothing. */
export function Enclave({ auction }: PanelProps) {
  return (
    <Panel
      title="Enclave"
      note="Scoring runs inside the confidential handler. The policy is loaded there and logged nowhere."
    >
      <Field label="State" value={auction.state} />
      <Field label="Bids root" value={<code>{short(auction.bidsRoot)}</code>} />
    </Panel>
  );
}
