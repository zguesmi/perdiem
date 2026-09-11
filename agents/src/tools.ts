import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { bytesToHex } from "viem";
import { z } from "zod";

import { bidCommitment, bidHash, bidSchema, type Bid } from "../../shared/bid.ts";
import { sealBid } from "../../shared/sealed-bid.ts";
import type { BookingCredentials } from "./config.ts";
import { searchHotels } from "./hotels.ts";
import { sealedAuctionAbi, usdcAbi } from "./abi.ts";
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
  signer: Signer;
  sealedAuction: `0x${string}`;
  usdc: `0x${string}`;
  stake: bigint;
  enclavePublicKey: Uint8Array;
  relayUrl: string;
  booking: BookingCredentials;
  priceBand: { min: number; max: number };
  liteApiKey: string;
}

export const submitBidInput = z
  .object({
    hotelId: z.string().min(1).describe("An identifier from getHotelId."),
    hotelName: z.string().min(1),
    stars: z.int().min(1).max(5),
    price: z.int().positive().describe("The whole stay, in USDC minor units. 330 USDC is 330000000."),
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
 * The model never sees a hash, a salt, a signature or a key. Nothing below reaches a log or an
 * error message.
 */
export async function submitBid(
  context: BidRunContext,
  input: SubmitBidInput,
  onCommitted: () => void = () => {},
): Promise<string> {
  if (Math.floor(Date.now() / 1000) >= context.auction.bidDeadline) {
    throw new Error("the bid deadline has passed");
  }

  const { min, max } = context.priceBand;
  if (input.price < min || input.price > max) {
    throw new Error(`price ${input.price} is outside this supplier's band of ${min} to ${max}`);
  }

  const bid: Bid = bidSchema.parse({
    ...input,
    auctionId: context.auction.auctionId,
    supplier: context.signer.address,
  });

  const hash = bidHash(bid);
  const signature = await context.signer.signBid(bid, context.sealedAuction);
  const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  const commitment = bidCommitment(hash, salt);
  const envelope = sealBid(
    { bid, salt, signature, ...context.booking },
    context.enclavePublicKey,
    context.auction.auctionId,
  );

  // The stake is pulled by `commit`, so the approval has to land first.
  await context.signer.write({
    address: context.usdc,
    abi: usdcAbi,
    functionName: "approve",
    args: [context.sealedAuction, context.stake],
  });
  await context.signer.write({
    address: context.sealedAuction,
    abi: sealedAuctionAbi,
    functionName: "commit",
    args: [context.auction.auctionId, commitment],
  });
  // The stake is now locked. Whatever happens below, this agent must not commit a second time:
  // `commit` is once per address, the second call reverts, and the relay refuses the second post.
  onCommitted();

  // After the commitment, never before: the relay is blind, and a sealed bid with no commitment
  // behind it is one the enclave drops.
  const posted = await fetch(
    `${context.relayUrl}/auctions/${context.auction.auctionId}/bids/${context.signer.address}`,
    { method: "PUT", body: bytesToHex(envelope) },
  );
  if (posted.status !== 201) {
    throw new Error(`the relay refused the sealed bid with ${posted.status}`);
  }

  return `Bid submitted at ${input.price}. The stake is committed and the sealed bid is at the relay. You are done.`;
}

/**
 * The two tools, and a way to ask whether the bid actually landed. The turn cap cannot tell a run
 * that bid on its third turn from one that is still arguing with itself without it.
 */
export function createTools(context: BidRunContext) {
  let committed = false;
  let submitted = false;

  /**
   * The guarded submit path. A retry after the stake is locked would revert on chain and be refused
   * by the relay, so the model is told to stop rather than handed an error it will work around.
   */
  async function submit(input: SubmitBidInput): Promise<string> {
    if (committed) {
      throw new Error("this agent has already committed its one bid. Stop.");
    }
    const result = await submitBid(context, input, () => {
      committed = true;
    });
    submitted = true;
    return result;
  }

  const tools = [
    betaZodTool({
      name: "getHotelId",
      description:
        "Real hotels in a city: identifier, name and star level. Pick one at your own star level.",
      inputSchema: z
        .object({
          city: z.string().min(1),
          countryCode: z.string().length(2).describe("ISO 3166-1 alpha-2, for example FR."),
        })
        .strict(),
      run: async ({ city, countryCode }) =>
        JSON.stringify(await searchHotels(context.liteApiKey, { city, countryCode })),
    }),
    betaZodTool({
      name: "submitBid",
      description:
        "Submit this supplier's one bid. Binds it on chain with the stake and seals it to the enclave. Call it once.",
      inputSchema: submitBidInput,
      run: submit,
    }),
  ];

  return { tools, submit, committed: () => committed, submitted: () => submitted };
}
