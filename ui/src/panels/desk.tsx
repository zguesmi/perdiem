import { useState } from "react";

import type { Config } from "../auction.ts";
import {
  confirmPolicy,
  parseIntent,
  type Draft,
  type Funding as FundingAnswer,
} from "../purchaser.ts";

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
  const [intent, setIntent] = useState("");
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
        placeholder="Two nights in Paris from 12 October, four stars, up to 5.2 USDC. Refundable and breakfast are worth paying for."
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
