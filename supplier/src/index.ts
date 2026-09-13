import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { hexToBytes } from "viem";
import { z } from "zod";

import { sealedAuctionAbi } from "../../shared/abi.ts";
import { arc, ARC_CHAIN_ID } from "../../shared/chain.ts";
import {
  banner,
  bold,
  coral,
  cyan,
  describeError,
  dim,
  green,
  group,
  red,
  role,
  separator,
  shortHex,
  stars,
  step,
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
    console.log(dim(`  waiting ${delay} ms, so that three agents do not call Circle at once`));
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
  console.log(step("Bid placed", `${green("✓")} on ${cyan(shortHex(auction.auctionId))}`));
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

  const client = createArcClient(deployment.rpcUrl);
  const contract = { address: deployment.sealedAuction, abi: sealedAuctionAbi } as const;
  // Read before the watcher starts, so an auction that opens during startup is still delivered.
  const fromBlock = await client.getBlockNumber();
  // Asked of the node rather than taken from the environment: the chain a service signs against is
  // whichever one answers on the RPC it was given.
  const [chainId, usdcAddress, enclavePublicKey, stake] = await Promise.all([
    client.getChainId(),
    client.readContract({ ...contract, functionName: "usdc" }),
    client.readContract({ ...contract, functionName: "enclavePublicKey" }),
    client.readContract({ ...contract, functionName: "SUPPLIER_STAKE" }),
  ]);
  const chainName = chainId === ARC_CHAIN_ID ? arc(deployment.rpcUrl).name : "local chain";

  // Everything an operator would otherwise have to infer from three files and an environment: which
  // hotel this agent sells, which address stakes and gets paid, and what the model may do.
  console.log(
    banner(`Supplier: ${config.name} - listening to ${chainName}`, [
      ["wallet", `${cyan(signer.address)} ${dim(`(${wallet.kind})`)}`],
      ["chain", `${chainName} (${chainId})  ${deployment.rpcUrl}`],
      ["auction contract", cyan(deployment.sealedAuction)],
      ["relay", deployment.relayUrl],
    ]),
  );
  console.log(
    group("hotel", [
      ["id", config.hotel.hotelId],
      ["name", config.hotel.hotelName],
      ["stars", yellow(stars(config.hotel.stars))],
      [
        "price",
        `${bold(`${usdcAmount(config.priceRange.min)} to ${usdcAmount(config.priceRange.max)} USDC`)} a night`,
      ],
    ]),
  );
  console.log(
    group("agent", [
      ["model", coral(config.model)],
      ["tools", yellow(`[${TOOL_NAMES.join(", ")}]`)],
      ["role", `"${role(rules)}"`],
    ]),
  );

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

  // A bid is not awaited here. One auction that takes twelve model turns must not hide the next
  // one, and one auction that fails must not stop the agent bidding on anything else.
  await watchAuctions(
    client,
    deployment.sealedAuction,
    { signal: stopping.signal, fromBlock, pollMilliseconds: deployment.pollMilliseconds },
    (auction) => {
      console.log(separator());
      console.log(
        step(
          "Auction seen",
          `${cyan(shortHex(auction.auctionId))}  ${auction.city}, ${auction.checkin} to ` +
            `${auction.checkout}, ${auction.numberOfRooms} ${auction.roomType}, ` +
            `${auction.minStars} stars or better`,
        ),
      );
      void bidOn(supplier, auction).catch((error: unknown) => {
        console.error(red(`${shortHex(auction.auctionId)}: ${describeError(error)}`));
      });
    },
  );

  console.log(dim("stopped"));
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error: unknown) => {
    console.error(red(describeError(error)));
    process.exit(1);
  });
}
