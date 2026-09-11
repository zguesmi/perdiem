import Anthropic from "@anthropic-ai/sdk";

import type { AgentConfig } from "./config.ts";
import { createTools, type AuctionTerms, type BidRunContext } from "./tools.ts";

/** A run that has not bid after this many assistant turns has drifted. It exits non-zero. */
const MAX_TURNS = 12;

/**
 * What the model is told about the world. The operator's sentence is the only part that changes
 * between the three agents; everything else is the auction, read from the log.
 *
 * Three things are deliberately derived here rather than stated: the number of nights, the season,
 * and which hotel matches this supplier's star level. They are what the model is for.
 */
export function systemPrompt(
  rules: string,
  auction: AuctionTerms,
  hotel: AgentConfig["hotel"],
): string {
  return [
    "You are a hotel supplier's bidding agent. Bid once on the request below, then stop.",
    "",
    `Your business rules: ${rules}`,
    "",
    `You sell one hotel: ${hotel.hotelName}, ${hotel.stars} stars. It is attached to`,
    "every bid you make. You do not choose it and you cannot change it.",
    "",
    "The request:",
    `- City: ${auction.city}`,
    `- Check in: ${auction.checkin}`,
    `- Check out: ${auction.checkout}`,
    `- Minimum stars the buyer asked for: ${auction.minStars}`,
    `- Room type: ${auction.roomType}`,
    `- Rooms: ${auction.numberOfRooms}`,
    "",
    "How to work:",
    "1. Count the nights: check out minus check in. The rate card prices the whole stay, not one night.",
    "2. Decide the season from the month of the check in date. Winter is December, January and February.",
    "3. Read the refundable and breakfast terms off your rules.",
    "4. Match the room type and the room count to the request, or the buyer drops your bid.",
    "5. Call submitBid once, with the price your rules give.",
    "",
    "What submitBid does, so that you call it once and only once:",
    "- It signs your bid and binds it on chain, which locks a stake of this supplier's money.",
    "- It encrypts the bid so that nobody, the buyer included, can read your price before scoring.",
    "- It is not reversible and it cannot be repeated. A second call fails and the stake stays locked.",
    "- You never see or supply a hash, a salt, a signature or a key. It holds all of those.",
    "",
    "Prices are USDC minor units: six decimals, so 330 USDC is 330000000.",
    "Bid your published rate. Do not discount to win, and do not bid at all if your rules do not cover this request.",
  ].join("\n");
}

/**
 * One auction, one bid, one process. The runner ends when the model stops calling tools, and the
 * turn cap ends it when the model will not stop.
 */
export async function runBidder(
  config: AgentConfig,
  rules: string,
  context: BidRunContext,
): Promise<void> {
  const { tools, committed, submitted } = createTools(context);
  const runner = new Anthropic().beta.messages.toolRunner({
    model: config.model,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: config.effort },
    system: systemPrompt(rules, context.auction, context.hotel),
    tools,
    messages: [{ role: "user", content: "Bid on this request." }],
    max_iterations: MAX_TURNS,
  });

  for await (const message of runner) {
    if (message.stop_reason === "refusal") {
      throw new Error(`the model declined to bid: ${message.stop_details?.category ?? "unknown"}`);
    }
  }

  if (!submitted()) {
    // The two failures need different answers: a stake that is locked comes back through
    // `timeoutRefund`, and a run that never bid costs nothing.
    throw new Error(
      committed()
        ? "the stake is committed but the sealed bid never reached the relay"
        : `no bid after at most ${MAX_TURNS} turns`,
    );
  }
}
