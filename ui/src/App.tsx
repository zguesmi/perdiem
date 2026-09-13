import { useState } from "react";

import { readConfig, short, type Config } from "./auction.ts";
import { Bids } from "./panels/bids.tsx";
import { Desk } from "./panels/desk.tsx";
import { Enclave } from "./panels/enclave.tsx";
import { Funding } from "./panels/funding.tsx";
import { Intent } from "./panels/intent.tsx";
import { Settlement } from "./panels/settlement.tsx";
import type { Funding as FundingAnswer } from "./purchaser.ts";
import { useAuction } from "./use-auction.ts";

/** Read once, at import. Misconfiguration is shown rather than thrown: a blank page names nothing. */
const configuration = ((): { config?: Config; error?: string } => {
  try {
    return { config: readConfig(import.meta.env as Record<string, string | undefined>) };
  } catch (cause) {
    return { error: (cause as Error).message };
  }
})();

/**
 * One page, five panels, top to bottom: intent, funding, bids, enclave, settlement.
 *
 * The page holds no auction state of its own. Every panel is rendered from what `useAuction`
 * re-read, so a reload and a refresh show the same thing and there is nothing here to disagree
 * with the chain.
 *
 * It also cannot show the private half of the policy, because it never has it: the maximum price
 * and the preferences live in the workflow secret, and only the policy hash is on chain.
 */
export default function App() {
  const { config } = configuration;
  const [funding, setFunding] = useState<FundingAnswer>();
  const { auction, error: readError } = useAuction(config);
  const error = configuration.error ?? readError;

  return (
    <main>
      <h1>Perdiem</h1>
      <p className="lede">
        Corporate hotel booking where the buyer&rsquo;s selection rules stay private and sealed bids
        guarantee the best deal.
      </p>

      {error && <p className="error">{error}</p>}

      {config && <Desk config={config} onFunded={setFunding} />}

      {config && auction === undefined && !error && <p className="note">Reading the chain…</p>}
      {config && auction === null && (
        <p className="note">No auction yet. The page shows the newest one as soon as it opens.</p>
      )}

      {config && auction && (
        <>
          <p className="note">
            Auction <code>{short(auction.auctionId)}</code>, state <strong>{auction.state}</strong>
          </p>
          <Intent config={config} auction={auction} />
          <Funding
            config={config}
            auction={auction}
            funding={funding?.auctionId === auction.auctionId ? funding : undefined}
          />
          <Bids config={config} auction={auction} />
          <Enclave config={config} auction={auction} />
          <Settlement config={config} auction={auction} />
        </>
      )}
    </main>
  );
}
