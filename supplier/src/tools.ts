import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { bytesToHex } from "viem";
import { z } from "zod";

import { bidCommitment, bidHash, bidSchema, type Bid } from "../../shared/bid.ts";
import {
  bold,
  cyan,
  describeError,
  dim,
  green,
  red,
  shortHex,
  step,
  usdcAmount,
} from "../../shared/log.ts";
import { sealBid } from "../../shared/sealed-bid.ts";
import type { AgentConfig, BookingCredentials } from "./config.ts";
import { sealedAuctionAbi, usdcAbi } from "../../shared/abi.ts";
import type { Signer } from "./signer.ts";

/** The terms an agent reads from the log. It never derives an auction identifier. */
export interface AuctionTerms {
  auctionId: `0x${string}`;
  bidDeadline: number;
  city: string;
  checkin: string;
  checkout: string;
  minStars: number;
  roomType: string;
  numberOfRooms: number;
  tradeDownStars: number;
}

export interface BidRunContext {
  auction: AuctionTerms;
  hotel: AgentConfig["hotel"];
  signer: Signer;
  sealedAuction: `0x${string}`;
  usdc: `0x${string}`;
  stake: bigint;
  enclavePublicKey: Uint8Array;
  relayUrl: string;
  booking: BookingCredentials;
  priceRange: { min: number; max: number };
}

/** Every tool the model holds, named once so the startup block and `createTools` cannot drift. */
export const TOOL_NAMES = ["submitBid"] as const;

/**
 * What the model decides. The hotel is not here: it is the operator's, fixed in the configuration,
 * so the model cannot bid a room this supplier does not sell.
 */
export const submitBidInput = z
  .object({
    price: z
      .int()
      .positive()
      .describe(
        "The whole stay, in USDC minor units. USDC has six decimals, so 4.4 USDC is 4400000.",
      ),
    refundable: z.boolean(),
    breakfastIncluded: z.boolean(),
    roomType: z.string().min(1),
    numberOfRooms: z.int().min(1).max(255),
  })
  .strict();

export type SubmitBidInput = z.infer<typeof submitBidInput>;

/**
 * Everything between a priced offer and a bound bid, in the one order that is legal: hash, sign,
 * salt, commit, seal, write, post. Split into separate tools, a model can seal without committing,
 * commit without posting, or commit twice, and each of those is a silently dropped bid.
 *
 * The model never sees a hash, a salt, a signature or a key, and neither does a log line. Each
 * step below can be the one that hangs, so each prints what it produced and how long it took.
 */
export async function submitBid(
  context: BidRunContext,
  input: SubmitBidInput,
  onCommitted: () => void = () => {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (now >= context.auction.bidDeadline) {
    throw new Error("the bid deadline has passed");
  }

  const { min, max } = context.priceRange;
  if (input.price < min || input.price > max) {
    throw new Error(`price ${input.price} is outside this supplier's range of ${min} to ${max}`);
  }

  const bid: Bid = bidSchema.parse({
    ...input,
    ...context.hotel,
    auctionId: context.auction.auctionId,
    supplier: context.signer.address,
  });

  console.log(
    step(
      "Bid priced",
      `${bold(`${usdcAmount(bid.price)} USDC`)} for ${bid.numberOfRooms} ${bid.roomType}, ` +
        `${bid.refundable ? "refundable" : "non-refundable"}, ` +
        `${bid.breakfastIncluded ? "breakfast" : "no breakfast"}, ` +
        `${context.auction.bidDeadline - now} s before the deadline`,
    ),
  );

  const hash = bidHash(bid);
  const took = (started: number) => dim(`${Date.now() - started} ms`);

  let started = Date.now();
  // The signature itself stays out of the log: it verifies a guessed price against this bid, and
  // the price is what the envelope exists to keep.
  const signature = await context.signer.signBid(bid, context.sealedAuction);
  console.log(
    step(
      "Bid signed",
      `${green("✓")} EIP-712 by ${cyan(context.signer.address)}  ${took(started)}`,
    ),
  );

  const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  const commitment = bidCommitment(hash, salt);
  const envelope = sealBid(
    { bid, salt, signature, ...context.booking },
    context.enclavePublicKey,
    context.auction.auctionId,
  );
  console.log(step("Bid sealed", `${envelope.length} bytes to the enclave key`));

  // The stake is pulled by `commit`, so the approval has to land first.
  started = Date.now();
  await context.signer.write({
    address: context.usdc,
    abi: usdcAbi,
    functionName: "approve",
    args: [context.sealedAuction, context.stake],
  });
  console.log(
    step(
      "Stake approved",
      `${bold(`${usdcAmount(context.stake)} USDC`)} allowance on ${cyan(context.usdc)}  ${took(started)}`,
    ),
  );

  started = Date.now();
  const transaction = await context.signer.write({
    address: context.sealedAuction,
    abi: sealedAuctionAbi,
    functionName: "commit",
    args: [context.auction.auctionId, commitment],
  });
  console.log(
    step(
      "Bid committed",
      `[commitment: ${cyan(shortHex(commitment))}, tx: ${cyan(shortHex(transaction))}]  ${took(started)}`,
    ),
  );
  // The stake is now locked. Whatever happens below, this agent must not commit a second time:
  // `commit` is once per address, the second call reverts, and the relay refuses the second post.
  onCommitted();

  // After the commitment, never before: the relay is blind, and a sealed bid with no commitment
  // behind it is one the enclave drops.
  started = Date.now();
  const posted = await fetch(
    `${context.relayUrl}/auctions/${context.auction.auctionId}/bids/${context.signer.address}`,
    { method: "PUT", body: bytesToHex(envelope) },
  );
  if (posted.status !== 201) {
    throw new Error(`the relay refused the sealed bid with ${posted.status}`);
  }
  console.log(
    step(
      "Bid uploaded",
      `${green("✓")} the relay holds it under ${cyan(context.signer.address)}  ${took(started)}`,
    ),
  );

  return `Bid submitted at ${input.price}. The stake is committed and the sealed bid is at the relay. You are done.`;
}

/**
 * The tool, and a way to ask whether the bid actually landed. The turn cap cannot tell a run
 * that bid on its third turn from one that is still arguing with itself without it.
 */
export function createTools(context: BidRunContext) {
  let committed = false;
  let submitted = false;
  // Every refusal the model was handed. The runner reads them when a run ends with no bid: the
  // model is told why its call failed, decides to stop, and that reason reaches nobody else.
  const refusals: string[] = [];

  /**
   * The guarded submit path. A retry after the stake is locked would revert on chain and be refused
   * by the relay, so the model is told to stop rather than handed an error it will work around.
   */
  async function submit(input: SubmitBidInput): Promise<string> {
    if (committed) {
      throw new Error("this agent has already committed its one bid. Stop.");
    }
    const started = Date.now();

    try {
      const result = await submitBid(context, input, () => {
        committed = true;
      });
      submitted = true;
      return result;
    } catch (error) {
      // The refusal is answered to the model, which then tries something else. Kept here as well,
      // because the runner reads these when a run ends with no bid.
      const refusal = describeError(error);
      refusals.push(refusal);
      console.error(red(`submitBid refused it after ${Date.now() - started} ms: ${refusal}`));
      throw error;
    }
  }

  const tools = [
    betaZodTool({
      name: TOOL_NAMES[0],
      description:
        "Submit this supplier's one bid. Binds it on chain with the stake and seals it to the enclave. Call it once.",
      inputSchema: submitBidInput,
      run: submit,
    }),
  ];

  return {
    tools,
    submit,
    committed: () => committed,
    submitted: () => submitted,
    refusals: () => [...refusals],
  };
}
