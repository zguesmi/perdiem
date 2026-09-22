import { useState } from "react";

import type { Config } from "./auction.ts";
import { confirmPolicy, parseIntent, type Draft } from "./purchaser.ts";

/**
 * What the box starts with, so a buyer opens an auction without writing anything. It carries every
 * number the policy needs: the stay, the ceiling, both preferences and the trade-down.
 */
const EXAMPLE_INTENT =
  "Two nights in Paris, 12 to 14 October 2026. One double room, 4 stars or better, " +
  "at most 6 USDC for the whole stay. Free cancellation is worth 2 USDC to me and " +
  "breakfast 1 USDC. Take 3 stars only if it is at least 60% cheaper than the best 4-star bid.";

/**
 * One sentence in, a funded auction out.
 *
 * Two steps and not one, because the policy the service hashed is the policy the buyer read. The
 * summary is prose the model wrote and nothing downstream reads it; the policy behind it goes back
 * to `/confirm` byte for byte, and that is what gets hashed.
 *
 * The confirmed summary stays on the page while the auction runs. It is the only place the buyer
 * can read back what they approved, and the chain holds nothing but its hash.
 */
export function Request({ config }: { config: Config }) {
  const [intent, setIntent] = useState(EXAMPLE_INTENT);
  const [draft, setDraft] = useState<Draft>();
  const [confirmed, setConfirmed] = useState<string>();
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

  const answered = draft ?? confirmed;

  return (
    <section className="card compose">
      <label className="ask" htmlFor="intent">
        Just tell the agent what you are looking for
      </label>
      <textarea
        className={confirmed && !draft ? "compact" : undefined}
        id="intent"
        rows={confirmed && !draft ? 1 : 3}
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
            void run(async () => {
              setConfirmed(undefined);
              setDraft(await parseIntent(config.purchaserUrl, intent));
            })
          }
        >
          {busy && !draft ? "Reading…" : "Send"}
        </button>
      </div>

      {answered && (
        <div className="answer">
          <div className="eyebrow who">
            {draft ? "Please confirm booking details" : "Booking details you confirmed"}
          </div>
          <p className="summary">{draft ? draft.summary : confirmed}</p>
          {draft && (
            <div className="actions">
              <button
                className="primary"
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await confirmPolicy(config.purchaserUrl, draft.policy);
                    setConfirmed(draft.summary);
                    setDraft(undefined);
                    setIntent("");
                  })
                }
              >
                {busy ? "Funding…" : "Confirm"}
              </button>
              <button
                className="quiet"
                type="button"
                disabled={busy}
                onClick={() => setDraft(undefined)}
              >
                Start again
              </button>
            </div>
          )}
        </div>
      )}

      {error && <p className="error">{error}</p>}
    </section>
  );
}
