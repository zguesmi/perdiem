import type { Hex } from "viem";

import { formatUsdc } from "./auction.ts";

/**
 * The two calls the buyer makes. Everything else on the page is read from the chain.
 *
 * The parsed policy is carried back to `/confirm` verbatim, as an opaque value. The page does not
 * validate it and could not usefully do so: the service validates it against the schema, hashes
 * exactly what it validated, and that hash is the commitment.
 */
export type Draft = { policy: unknown; summary: string };

/** What the buyer gets once the money is locked. The page shows the last three. */
export type Funding = {
  auctionId: Hex;
  approveHash: Hex;
  createAuctionHash: Hex;
  /** True when the payout cap put this auction above the ceiling and the key quorum signed. */
  quorumSigned: boolean;
};

export function parseIntent(purchaserUrl: string, intent: string): Promise<Draft> {
  return post<Draft>(`${purchaserUrl}/intent`, { intent });
}

export function confirmPolicy(purchaserUrl: string, policy: unknown): Promise<Funding> {
  return post<Funding>(`${purchaserUrl}/confirm`, { policy });
}

async function post<T>(url: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(`the purchaser service at ${url} did not answer`);
  }

  const answer = (await response.json().catch(() => ({}))) as {
    error?: string;
    payoutCap?: string;
  };

  if (!response.ok) {
    // A refusal names the cap the organization would not fund, so the buyer knows which number to
    // lower. Over budget is the expected refusal: lower the maximum price and confirm again.
    const refused = answer.error ?? `the purchaser service answered ${response.status}`;
    throw new Error(
      answer.payoutCap === undefined
        ? refused
        : `${refused} (payout cap ${formatUsdc(BigInt(answer.payoutCap))})`,
    );
  }

  return answer as T;
}
