import type { Bid } from "../../shared/bid.ts";
import type { Policy } from "../../shared/policy.ts";

/**
 * Scoring lives here and only here. It is never placed in `shared/`, because a supplier
 * agent that could import the rule could brute-force its own price against it. See
 * `docs/adr/0002-scoring-is-not-shared.md`.
 *
 * Everything below runs inside `handlerInTee`. Nothing here may be logged.
 */

/**
 * The members of a Bid that scoring reads. The rest of the signed struct identifies the bid and the
 * hotel, which the caller keeps and this file never needs.
 */
export type ScorableBid = Pick<
  Bid,
  "supplier" | "stars" | "price" | "refundable" | "breakfastIncluded" | "roomType" | "numberOfRooms"
>;

/**
 * What scoring alone decides. The enclave adds the auction, the hashes and the booking id to it
 * before it encodes the `Settlement` that `shared/report.ts` puts on the wire.
 */
export interface ScoringResult {
  winner: Bid["supplier"] | null;
  payout: number;
}

/**
 * Eligibility, then score, then the winner. Deterministic integer arithmetic throughout: the same
 * inputs must produce the same settlement on every node.
 */
export function settle(policy: Policy, bids: readonly ScorableBid[]): ScoringResult {
  const { maxPrice, hardRequirements, tradeDown, preferences } = policy;

  // Neither the city nor the dates are members of the Bid: a supplier bids against one auction, and
  // the enclave books that auction's dates. What is left of the hard requirements is the room.
  const affordable = bids.filter(
    (bid) =>
      bid.price <= maxPrice &&
      bid.roomType === hardRequirements.roomType &&
      bid.numberOfRooms === hardRequirements.numberOfRooms,
  );

  const atMinStars = affordable.filter((bid) => bid.stars >= hardRequirements.minStars);

  // Computed before any trade-down check, over the bids that pass every other check. With no such
  // bid, a trade-down bid is eligible on the maximum price alone.
  const cheapestAtMinStars = atMinStars.reduce<number | null>(
    (cheapest, bid) => (cheapest === null || bid.price < cheapest ? bid.price : cheapest),
    null,
  );

  const eligible = affordable.filter(
    (bid) =>
      bid.stars >= hardRequirements.minStars ||
      (bid.stars === tradeDown.stars &&
        (cheapestAtMinStars === null ||
          bid.price * 100 <= cheapestAtMinStars * (100 - tradeDown.requiredDiscountPercentage))),
  );

  // `maxPrice` is the same for every bid, so it cannot move the ranking. It stays in the formula
  // because it keeps a score positive and readable.
  const scoreOf = (bid: ScorableBid): number =>
    maxPrice -
    bid.price +
    (bid.refundable ? preferences.refundable : 0) +
    (bid.breakfastIncluded ? preferences.breakfastIncluded : 0);

  // Highest score, then lower price, then lower supplier address. A total order, so no tie survives
  // and every node ranks the same bids the same way.
  const ranked = [...eligible].sort(
    (left, right) =>
      scoreOf(right) - scoreOf(left) ||
      left.price - right.price ||
      compareAddresses(left.supplier, right.supplier),
  );

  const winner = ranked[0];

  return winner === undefined
    ? { winner: null, payout: 0 }
    : { winner: winner.supplier, payout: winner.price };
}

/** Addresses compare in one case: a checksummed address mixes cases, and `B` sorts under `a`. */
function compareAddresses(left: string, right: string): number {
  const lowered = { left: left.toLowerCase(), right: right.toLowerCase() };

  return lowered.left < lowered.right ? -1 : lowered.left > lowered.right ? 1 : 0;
}
