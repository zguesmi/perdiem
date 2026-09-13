import { useState } from "react";

import type { Config } from "./auction.ts";
import { confirmPolicy, parseIntent, type Draft } from "./purchaser.ts";

/**
 * What the box starts with, so a reader can open an auction without writing anything. Every number
 * the policy needs is in it: the stay, the ceiling, both preferences and the trade-down.
 */
const EXAMPLE_INTENT =
  "Two nights in Paris, 12 to 14 October 2026. One double room, 4 stars or better, " +
  "at most 5.2 USDC for the whole stay. Free cancellation is worth 0.5 USDC to me and " +
  "breakfast 0.4 USDC. Take 3 stars only if it is at least 30% cheaper than the best 4-star bid.";

/**
 * One sentence in, a funded auction out.
 *
 * Two steps and not one, because the policy the service hashed is the policy the buyer read. The
 * summary is prose the model wrote and nothing downstream reads it; the policy behind it goes back
 * to `/confirm` byte for byte, and that is what gets hashed.
 */
export function Request({ config }: { config: Config }) {
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
    <section className="card compose">
      <label className="ask" htmlFor="intent">
        Just tell the agent what you are looking for
      </label>
      <textarea
        id="intent"
        rows={3}
        spellCheck={false}
        value={intent}
        disabled={busy || draft !== undefined}
        onChange={(event) => setIntent(event.target.value)}
      />

      <div className="actions">
        <button
          className="primary"
          type="button"
          disabled={busy || draft !== undefined || intent.trim() === ""}
          onClick={() =>
            void run(async () => setDraft(await parseIntent(config.purchaserUrl, intent)))
          }
        >
          {busy && !draft ? "Reading…" : "Send"}
        </button>
      </div>

      {draft && (
        <div className="answer">
          <div className="eyebrow who">Please confirm booking details</div>
          <p className="summary">{draft.summary}</p>
          <div className="actions">
            <button
              className="primary"
              type="button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await confirmPolicy(config.purchaserUrl, draft.policy);
                  setDraft(undefined);
                  setIntent("");
                })
              }
            >
              {busy ? "Funding…" : "Confirm"}
            </button>
            <button className="quiet" type="button" disabled={busy} onClick={() => setDraft(undefined)}>
              Start again
            </button>
          </div>
        </div>
      )}

      {error && <p className="error">{error}</p>}
    </section>
  );
}
