import type { Policy } from "@perdiem/core";

/**
 * Scoring lives here and only here. It is never exported from `@perdiem/core`, because a supplier
 * agent that could import the rule could brute-force its own price against it. See
 * `docs/adr/0002-scoring-is-not-shared.md`.
 *
 * Everything below runs inside `handlerInTee`. Nothing here may be logged.
 */
export interface ScoredBid {
  supplier: string;
  price: number;
  score: number;
}

export interface Settlement {
  winner: string | null;
  payout: number;
}

/** A bid as it reaches the enclave, after decryption, signature check and commitment check. */
export interface Bid {
  supplier: string;
  hotelId: string;
  stars: number;
  distanceKm: number;
  price: number;
  refundable: boolean;
  breakfastIncluded: boolean;
  roomType: string;
  numberOfRooms: number;
}

/**
 * Eligibility, then score, then the winner. Deterministic integer arithmetic throughout: the same
 * inputs must produce the same settlement on every node.
 */
export function settle(_policy: Policy, _bids: Bid[]): Settlement {
  throw new Error(
    "settle is not implemented yet. See .scratch/build/01-policy-schema-and-scoring-formula.md",
  );
}
