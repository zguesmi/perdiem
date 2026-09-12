import { formatTime, formatUsdc, short } from "../auction.ts";
import type { Funding as FundingAnswer } from "../purchaser.ts";
import { Field, Panel, type PanelProps } from "./panel.tsx";

/** What the buyer locked in escrow, and the call that locked it. */
export function Funding({ auction, funding }: PanelProps & { funding?: FundingAnswer }) {
  return (
    <Panel
      title="Funding"
      note="The payout cap is padded above the maximum price, so the public transfer does not publish the ceiling."
    >
      <Field label="Buyer" value={<code>{short(auction.buyer)}</code>} />
      <Field label="Payout cap" value={formatUsdc(auction.payoutCap)} />
      <Field label="Bidding closes" value={formatTime(auction.bidDeadline)} />
      <Field label="Refundable after" value={formatTime(auction.finalizeDeadline)} />
      {funding && (
        <Field
          label="Authorized by"
          value={
            funding.quorumSigned
              ? "The spend policy and the two-signer key quorum"
              : "The spend policy alone"
          }
        />
      )}
    </Panel>
  );
}
