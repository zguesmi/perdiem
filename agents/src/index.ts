import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { hexToBytes } from "viem";
import { z } from "zod";

import { sealedAuctionAbi } from "./abi.ts";
import { runBidder } from "./bidder.ts";
import { createArcClient } from "./chain.ts";
import { bookingCredentialsSchema, loadAgentConfig } from "./config.ts";
import { createLocalSigner } from "./signer.ts";
import type { BidRunContext } from "./tools.ts";
import { nextAuction } from "./watcher.ts";

export { loadAgentConfig, type AgentConfig } from "./config.ts";
export { createLocalSigner, type Signer } from "./signer.ts";
export { submitBid, createTools, type AuctionTerms, type BidRunContext } from "./tools.ts";
export { nextAuction } from "./watcher.ts";

/** Secrets only. Nothing here reaches a committed file. */
const environment = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  AGENT_PRIVATE_KEY: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  BOOKING_URL: z.url(),
  BOOKING_API_KEY: z.string().min(1),
});

async function main(): Promise<void> {
  const name = process.argv[2];
  if (!name) {
    throw new Error("usage: agent <name>, where agents/config/<name>.json exists");
  }

  const secrets = environment.parse(process.env);
  const config = await loadAgentConfig(
    fileURLToPath(new URL(`../config/${name}.json`, import.meta.url)),
  );
  const rules = (
    await readFile(new URL(`../prompts/${name}.txt`, import.meta.url), "utf8")
  ).trim();

  // The rules are the only thing an operator changes between the three agents, so the run states
  // them before it does anything a reader would have to infer them from.
  console.log(`${config.name} at ${config.hotel.hotelName}, ${config.hotel.stars} stars`);
  console.log(`rules: ${rules}`);

  const client = createArcClient(config.rpcUrl);
  const signer = createLocalSigner({
    privateKey: secrets.AGENT_PRIVATE_KEY as `0x${string}`,
    rpcUrl: config.rpcUrl,
  });

  const contract = { address: config.sealedAuction, abi: sealedAuctionAbi } as const;
  const [usdc, enclavePublicKey, stake] = await Promise.all([
    client.readContract({ ...contract, functionName: "usdc" }),
    client.readContract({ ...contract, functionName: "enclavePublicKey" }),
    client.readContract({ ...contract, functionName: "SUPPLIER_STAKE" }),
  ]);

  const auction = await nextAuction(client, config.sealedAuction, {
    fromBlock: await client.getBlockNumber(),
  });

  const context: BidRunContext = {
    auction,
    hotel: config.hotel,
    signer,
    sealedAuction: config.sealedAuction,
    usdc,
    stake,
    enclavePublicKey: hexToBytes(enclavePublicKey),
    relayUrl: config.relayUrl,
    booking: bookingCredentialsSchema.parse({
      bookingUrl: secrets.BOOKING_URL,
      bookingApiKey: secrets.BOOKING_API_KEY,
    }),
    priceRange: config.priceRange,
  };

  await runBidder(config, rules, context);
  console.log(`${config.name}: bid placed on ${auction.auctionId}`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error: Error) => {
    console.error(error.message);
    process.exit(1);
  });
}
