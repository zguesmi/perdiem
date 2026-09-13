import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { hexToBytes } from "viem";
import { z } from "zod";

import { sealedAuctionAbi } from "../../shared/abi.ts";
import {
  banner,
  cyan,
  describeError,
  dim,
  green,
  red,
  stars,
  usdcAmount,
  yellow,
} from "../../shared/log.ts";
import { runBidder } from "./bidder.ts";
import { createArcClient } from "./chain.ts";
import {
  bookingCredentialsSchema,
  deploymentSchema,
  loadAgentConfig,
  walletSchema,
  type AgentConfig,
  type Deployment,
} from "./config.ts";
import { createSigner, type Signer } from "./signer.ts";
import { TOOL_NAMES, type AuctionTerms, type BidRunContext } from "./tools.ts";
import { watchAuctions } from "./watcher.ts";

export { loadAgentConfig, type AgentConfig, type Deployment } from "./config.ts";
export { createLocalSigner, createSigner, type Signer, type Wallet } from "./signer.ts";
export { createCircleAgentSigner } from "./circle.ts";
export {
  submitBid,
  createTools,
  TOOL_NAMES,
  type AuctionTerms,
  type BidRunContext,
} from "./tools.ts";
export { auctionTerms, watchAuctions } from "./watcher.ts";

/** Secrets only. Nothing here reaches a committed file. */
const environment = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  BOOKING_URL: z.url(),
  BOOKING_API_KEY: z.string().min(1),
});

type Secrets = z.infer<typeof environment>;

/** What every auction this agent bids on shares: the wallet, the escrow and the booking keys. */
interface Supplier {
  config: AgentConfig;
  deployment: Deployment;
  rules: string;
  signer: Signer;
  usdc: `0x${string}`;
  stake: bigint;
  enclavePublicKey: Uint8Array;
  booking: { bookingUrl: string; bookingApiKey: string };
}

async function bidOn(supplier: Supplier, auction: AuctionTerms): Promise<void> {
  const delay = supplier.deployment.startDelayMilliseconds;
  if (delay > 0) {
    console.log(`${supplier.config.name}: starting in ${delay} ms`);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  const context: BidRunContext = {
    auction,
    hotel: supplier.config.hotel,
    signer: supplier.signer,
    sealedAuction: supplier.deployment.sealedAuction,
    usdc: supplier.usdc,
    stake: supplier.stake,
    enclavePublicKey: supplier.enclavePublicKey,
    relayUrl: supplier.deployment.relayUrl,
    booking: supplier.booking,
    priceRange: supplier.config.priceRange,
  };

  await runBidder(supplier.config, supplier.rules, context);
  console.log(`${supplier.config.name}: ${green("bid placed")} on ${dim(auction.auctionId)}`);
}

async function main(): Promise<void> {
  const name = process.argv[2];
  if (!name) {
    throw new Error("usage: agent <name>, where supplier/config/<name>.json exists");
  }

  const secrets: Secrets = environment.parse(process.env);
  const deployment = deploymentSchema.parse(process.env);
  const wallet = walletSchema.parse(process.env);
  const config = await loadAgentConfig(
    fileURLToPath(new URL(`../config/${name}.json`, import.meta.url)),
  );
  const rules = (await readFile(new URL(`../prompts/${name}.txt`, import.meta.url), "utf8")).trim();
  const signer = createSigner(wallet, deployment.rpcUrl);

  // Everything an operator would otherwise have to infer from three files and an environment: which
  // hotel this agent sells, which address stakes and gets paid, and what the model may do.
  console.log(
    banner(`Agent: ${config.name}`, [
      ["hotel", `${config.hotel.hotelName} ${stars(config.hotel.stars)}`],
      ["wallet", `${wallet.kind} ${cyan(signer.address)}`],
      ["model", `${config.model}, ${config.effort} effort`],
      ["tools", yellow(TOOL_NAMES.join(", "))],
      [
        "price",
        `${usdcAmount(config.priceRange.min)} to ${usdcAmount(config.priceRange.max)} USDC`,
      ],
      ["chain", `${cyan(deployment.sealedAuction)} on ${deployment.rpcUrl}`],
      ["relay", deployment.relayUrl],
      ["rules", rules],
    ]),
  );

  const client = createArcClient(deployment.rpcUrl);
  const contract = { address: deployment.sealedAuction, abi: sealedAuctionAbi } as const;
  // Read before the watcher starts, so an auction that opens during startup is still delivered.
  const fromBlock = await client.getBlockNumber();
  const [usdcAddress, enclavePublicKey, stake] = await Promise.all([
    client.readContract({ ...contract, functionName: "usdc" }),
    client.readContract({ ...contract, functionName: "enclavePublicKey" }),
    client.readContract({ ...contract, functionName: "SUPPLIER_STAKE" }),
  ]);

  const supplier: Supplier = {
    config,
    deployment,
    rules,
    signer,
    usdc: usdcAddress,
    stake,
    enclavePublicKey: hexToBytes(enclavePublicKey),
    booking: bookingCredentialsSchema.parse({
      bookingUrl: secrets.BOOKING_URL,
      bookingApiKey: secrets.BOOKING_API_KEY,
    }),
  };

  const stopping = new AbortController();
  process.once("SIGINT", () => stopping.abort());
  process.once("SIGTERM", () => stopping.abort());

  console.log(`listening from block ${fromBlock}`);

  // A bid is not awaited here. One auction that takes twelve model turns must not hide the next
  // one, and one auction that fails must not stop the agent bidding on anything else.
  await watchAuctions(
    client,
    deployment.sealedAuction,
    { signal: stopping.signal, fromBlock, pollMilliseconds: deployment.pollMilliseconds },
    (auction) => {
      console.log(`${config.name}: bidding on ${dim(auction.auctionId)}`);
      void bidOn(supplier, auction).catch((error: unknown) => {
        console.error(red(`${config.name}: ${auction.auctionId}: ${describeError(error)}`));
      });
    },
  );

  console.log(`${config.name}: stopped`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error: unknown) => {
    console.error(red(describeError(error)));
    process.exit(1);
  });
}
