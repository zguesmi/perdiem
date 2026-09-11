import { readFile } from "node:fs/promises";
import { z } from "zod";

import { addressSchema } from "../../shared/bid.ts";

/**
 * What an operator sets per agent. The rate card, the star level and the refundable and breakfast
 * policy are not here: they are what the operator tells the model in one sentence at startup.
 */
export const agentConfigSchema = z
  .object({
    name: z.string().min(1),
    relayUrl: z.url(),
    rpcUrl: z.url(),
    sealedAuction: addressSchema,
    /**
     * The price the model may bid, in USDC minor units. `submitBid` refuses anything outside it and
     * names the band, so the model corrects on the next turn instead of bidding a price the
     * operator never published.
     */
    priceBand: z.object({ min: z.int().positive(), max: z.int().positive() }),
    model: z.string().min(1).default("claude-opus-5"),
    effort: z.enum(["low", "medium", "high", "xhigh", "max"]).default("low"),
  })
  .strict()
  .refine((config) => config.priceBand.min <= config.priceBand.max, "priceBand.min exceeds max");

export type AgentConfig = z.infer<typeof agentConfigSchema>;

export async function loadAgentConfig(path: string): Promise<AgentConfig> {
  return agentConfigSchema.parse(JSON.parse(await readFile(path, "utf8")));
}

/** The supplier's own booking API, sealed into the envelope so the enclave can book for it. */
export const bookingCredentialsSchema = z
  .object({ bookingUrl: z.url(), bookingApiKey: z.string().min(1) })
  .strict();

export type BookingCredentials = z.infer<typeof bookingCredentialsSchema>;
