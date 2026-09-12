import { short } from "../auction.ts";
import { Field, Panel, type PanelProps } from "./panel.tsx";

/** The policy hash and the requirements every supplier may see. Never the policy itself. */
export function Intent({ auction }: PanelProps) {
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
    </Panel>
  );
}
