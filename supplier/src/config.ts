import { readFile } from "node:fs/promises";
import { z } from "zod";

import { addressSchema } from "../../shared/bid.ts";
import type { Wallet } from "./signer.ts";

/**
 * What an operator sets per agent. The rate card, the star level and the refundable and breakfast
 * policy are not here: they are what the operator tells the model in one sentence at startup.
 */
export const agentConfigSchema = z
  .object({
    name: z.string().min(1),
    /**
     * The hotel this supplier sells. It is an operator's choice, checked against the supplier's own
     * catalogue before the agent runs, so the enclave can book it. Nothing but the identifier is
     * checked by anyone: the star level is self-attested, per
     * `docs/adr/0004-bid-attributes-are-self-attested.md`.
     */
    hotel: z.object({
      hotelId: z.string().min(1),
      hotelName: z.string().min(1),
      stars: z.int().min(1).max(5),
    }),
    /**
     * The price the model may bid, in USDC minor units. `submitBid` refuses anything outside it and
     * names the range, so the model corrects on the next turn instead of bidding a price the
     * operator never published.
     */
    priceRange: z.object({ min: z.int().positive(), max: z.int().positive() }),
    model: z.string().min(1).default("claude-opus-5"),
    effort: z.enum(["low", "medium", "high", "xhigh", "max"]).default("low"),
  })
  .strict()
  .refine((config) => config.priceRange.min <= config.priceRange.max, "priceRange.min exceeds max");

export type AgentConfig = z.infer<typeof agentConfigSchema>;

export async function loadAgentConfig(path: string): Promise<AgentConfig> {
  return agentConfigSchema.parse(JSON.parse(await readFile(path, "utf8")));
}

/**
 * Where the agent reads and writes: the chain, the escrow and the relay. One deployment serves
 * every agent, so these are environment variables and not per-agent configuration, and
 * `onchain/scripts/deploy.ts` writes two of them.
 *
 * The RPC URL is an `http://` or `https://` endpoint. The agent watches `TermsPublished` by
 * reading `eth_getLogs` over a range it tracks itself, so it needs neither `eth_subscribe` nor
 * `eth_newFilter`.
 */
export const deploymentSchema = z
  .object({
    ARC_RPC_URL: z.url(),
    SEALED_AUCTION_ADDRESS: addressSchema,
    RELAY_URL: z.url(),
  })
  .transform((environment) => ({
    rpcUrl: environment.ARC_RPC_URL,
    sealedAuction: environment.SEALED_AUCTION_ADDRESS,
    relayUrl: environment.RELAY_URL,
  }));

export type Deployment = z.infer<typeof deploymentSchema>;

/** The supplier's own booking API, sealed into the envelope so the enclave can book for it. */
export const bookingCredentialsSchema = z
  .object({ bookingUrl: z.url(), bookingApiKey: z.string().min(1) })
  .strict();

export type BookingCredentials = z.infer<typeof bookingCredentialsSchema>;

/**
 * Which wallet this agent signs with. `circle` is the demo path, a Circle Agent Stack wallet driven
 * through a CLI session an operator opens once. `local` is a viem externally owned account and the
 * default, kept so the bid flow and its tests run with no Circle account.
 */
export const walletSchema = z
  .object({
    AGENT_SIGNER: z.enum(["local", "circle"]).default("local"),
    AGENT_PRIVATE_KEY: z
      .string()
      .regex(/^0x[0-9a-fA-F]{64}$/)
      .optional(),
    // An environment file carries a variable it has no value for as an empty string, and a local
    // signer never fills this one in, so empty means absent.
    CIRCLE_WALLET_ADDRESS: z.preprocess(
      (value) => (value === "" ? undefined : value),
      addressSchema.optional(),
    ),
  })
  .transform((environment, ctx): Wallet => {
    if (environment.AGENT_SIGNER === "circle") {
      if (environment.CIRCLE_WALLET_ADDRESS) {
        return { kind: "circle", address: environment.CIRCLE_WALLET_ADDRESS };
      }
      ctx.addIssue("AGENT_SIGNER=circle needs CIRCLE_WALLET_ADDRESS");
      return z.NEVER;
    }
    if (environment.AGENT_PRIVATE_KEY) {
      return { kind: "local", privateKey: environment.AGENT_PRIVATE_KEY as `0x${string}` };
    }
    ctx.addIssue("AGENT_SIGNER=local needs AGENT_PRIVATE_KEY");
    return z.NEVER;
  });
