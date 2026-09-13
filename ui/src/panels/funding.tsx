import { short } from "../auction.ts";
import type { Funding as FundingAnswer } from "../purchaser.ts";
import { Field, Panel, type PanelProps } from "./panel.tsx";

/** Who the buyer is and what let the money out. The amounts are on the stepper and the balances. */
export function Funding({ auction, funding }: PanelProps & { funding?: FundingAnswer }) {
  return (
    <Panel
      title="Funding"
      note="The payout cap is padded above the maximum price, so the public transfer does not publish the ceiling."
    >
      <Field label="Buyer" value={<code>{short(auction.buyer)}</code>} />
      {funding ? (
        <Field
          label="Authorized by"
          value={
            funding.quorumSigned
              ? "The spend policy and the two-signer key quorum"
              : "The spend policy alone"
          }
        />
      ) : (
        <p className="note">This page did not open the auction, so it did not see it authorized.</p>
      )}
    </Panel>
  );
}
