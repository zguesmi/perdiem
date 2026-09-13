import { useState } from "react";

import type { Config } from "../auction.ts";
import {
  confirmPolicy,
  parseIntent,
  type Draft,
  type Funding as FundingAnswer,
} from "../purchaser.ts";

/**
 * What the box starts with, so a reader can fund an auction without writing anything. Every number
 * the policy needs is in it: the stay, the ceiling, both preferences and the trade-down.
 */
const EXAMPLE_INTENT =
  "Two nights in Paris, 12 to 14 October 2026. One double room, 4 stars or better, " +
  "at most 5.2 USDC for the whole stay. Free cancellation is worth 0.5 USDC to me and " +
  "breakfast 0.4 USDC. Take 3 stars only if it is at least 30% cheaper than the best 4-star bid.";

/**
 * The buyer's half of the page: one sentence in, a funded auction out.
 *
 * Two steps and not one, because the policy the service hashed is the policy the buyer read. The
 * summary is prose the model wrote and nothing downstream reads it; the policy behind it goes back
 * to `/confirm` byte for byte, and that is what gets hashed.
 */
export function Desk({
  config,
  onFunded,
}: {
  config: Config;
  onFunded: (funding: FundingAnswer) => void;
}) {
  const [intent, setIntent] = useState(EXAMPLE_INTENT);
  const [draft, setDraft] = useState<Draft>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const run = async (work: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      await work();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h2>New auction</h2>
      <p className="note">
        One sentence. The service parses it, you approve what it read, and only then is anything
        hashed or funded.
      </p>

      <textarea
        value={intent}
        rows={3}
        disabled={busy || draft !== undefined}
        placeholder={EXAMPLE_INTENT}
        onChange={(event) => setIntent(event.target.value)}
      />

      {draft ? (
        <>
          <p className="field">
            <span className="label">Parsed</span>
            <span>{draft.summary}</span>
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                onFunded(await confirmPolicy(config.purchaserUrl, draft.policy));
                setDraft(undefined);
                setIntent("");
              })
            }
          >
            {busy ? "Funding…" : "Confirm and fund"}
          </button>
          <button type="button" disabled={busy} onClick={() => setDraft(undefined)}>
            Start again
          </button>
        </>
      ) : (
        <button
          type="button"
          disabled={busy || intent.trim() === ""}
          onClick={() =>
            void run(async () => setDraft(await parseIntent(config.purchaserUrl, intent)))
          }
        >
          {busy ? "Reading…" : "Read the request"}
        </button>
      )}

      {error && <p className="error">{error}</p>}
    </section>
  );
}
