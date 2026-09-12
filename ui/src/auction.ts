import {
  createPublicClient,
  formatUnits,
  http,
  parseEventLogs,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";

import { USDC_DECIMALS } from "../../shared/chain.ts";
import { sealedAuctionAbi } from "./abi.ts";

/** `SealedAuction.State`, in declaration order. The read returns the index. */
const STATES = ["None", "Created", "Bidding", "Settling", "Finalized", "Timeout"] as const;

export type AuctionState = (typeof STATES)[number];

/**
 * Everything the page needs. No private field can reach it: the maximum price and the preferences
 * are inside the policy, and only the policy's hash is on chain.
 */
export type AuctionView = {
  auctionId: Hex;
  state: AuctionState;
  buyer: Address;
  policyHash: Hex;
  payoutCap: bigint;
  bidDeadline: number;
  finalizeDeadline: number;
  createdTransaction: Hex;
  requirements?: PublicRequirements;
  termsTransaction?: Hex;
  bidsRoot: Hex;
  claimedTransaction?: Hex;
  bids: BidRow[];
  settlement?: Settlement;
  timedOutTransaction?: Hex;
};

export type PublicRequirements = {
  city: string;
  checkin: string;
  checkout: string;
  minStars: number;
  roomType: string;
  numberOfRooms: number;
  tradeDownStars: number;
};

/**
 * One committed bid. The commitment comes from the chain's own array, so a row exists even when its
 * `Committed` log or its sealed bid was not found.
 */
export type BidRow = {
  commitment: Hex;
  supplier?: Address;
  committedTransaction?: Hex;
  sealedBytes?: number;
};

export type Settlement = {
  winner: Address;
  payout: bigint;
  bookingId: string;
  finalizedTransaction: Hex;
};

export type Config = {
  rpcUrl: string;
  sealedAuction: Address;
  relayUrl: string;
  explorerUrl?: string;
  fromBlock: bigint;
};

/**
 * Vite exposes anything prefixed `VITE_` to the browser, so every value here is public by
 * construction. Missing configuration throws rather than defaulting: a page silently pointed at
 * the wrong chain reads as "the demo is broken".
 */
export function readConfig(env: Record<string, string | undefined>): Config {
  const required = (name: string): string => {
    const value = env[name];
    if (!value) {
      throw new Error(`${name} is not set. Copy ui/.env.example to ui/.env.local and fill it in.`);
    }
    return value;
  };

  return {
    rpcUrl: required("VITE_ARC_RPC_URL"),
    sealedAuction: required("VITE_SEALED_AUCTION_ADDRESS") as Address,
    relayUrl: required("VITE_RELAY_URL").replace(/\/$/, ""),
    // Optional: a local node has no explorer, and a hash is still readable as plain text.
    explorerUrl: env.VITE_EXPLORER_URL?.replace(/\/$/, ""),
    // Optional: a long-lived deployment does not want every poll walking the whole chain.
    fromBlock: BigInt(env.VITE_FROM_BLOCK ?? 0),
  };
}

export function createClient(config: Config): PublicClient {
  // No chain definition. Nothing here signs or estimates gas, so the reads need none.
  return createPublicClient({ transport: http(config.rpcUrl) });
}

/**
 * The newest auction, or `null` when none exists yet. One `eth_getLogs` for the transaction hashes,
 * then the views: a log says something happened once, and `auctions` says what is true now.
 */
export async function readAuction(
  client: PublicClient,
  config: Config,
): Promise<AuctionView | null> {
  const logs = parseEventLogs({
    abi: sealedAuctionAbi,
    logs: await client.getLogs({ address: config.sealedAuction, fromBlock: config.fromBlock }),
  });

  const created = logs.filter((log) => log.eventName === "AuctionCreated").at(-1);
  if (!created) {
    return null;
  }

  const auctionId = created.args.auctionId;
  const forThisAuction = logs.filter((log) => log.args.auctionId === auctionId);
  const find = <Name extends (typeof logs)[number]["eventName"]>(name: Name) =>
    forThisAuction.find((log) => log.eventName === name) as
      Extract<(typeof logs)[number], { eventName: Name }> | undefined;

  const contract = { address: config.sealedAuction, abi: sealedAuctionAbi } as const;
  const [auction, commitments, bidsRoot] = await Promise.all([
    client.readContract({ ...contract, functionName: "auctions", args: [auctionId] }),
    client.readContract({ ...contract, functionName: "commitments", args: [auctionId] }),
    client.readContract({ ...contract, functionName: "bidsRoot", args: [auctionId] }),
  ]);

  const terms = find("TermsPublished");
  const claimed = find("AuctionClaimed");
  const finalized = find("AuctionFinalized");
  const timedOut = find("AuctionTimedOut");

  const committed = forThisAuction.filter((log) => log.eventName === "Committed");
  const sealed = await readSealedBids(config, auctionId);

  return {
    auctionId,
    state: STATES[auction[0]] ?? "None",
    buyer: auction[1],
    bidDeadline: Number(auction[3]),
    finalizeDeadline: Number(auction[4]),
    policyHash: auction[5],
    payoutCap: auction[6],
    createdTransaction: created.transactionHash,
    requirements: terms?.args.requirements,
    termsTransaction: terms?.transactionHash,
    bidsRoot,
    claimedTransaction: claimed?.transactionHash,
    bids: commitments.map((commitment) => {
      const log = committed.find((entry) => entry.args.commitment === commitment);
      const supplier = log?.args.supplier;
      return {
        commitment,
        supplier,
        committedTransaction: log?.transactionHash,
        sealedBytes: supplier ? sealed.get(supplier.toLowerCase()) : undefined,
      };
    }),
    settlement: finalized && {
      winner: finalized.args.winner,
      payout: finalized.args.payout,
      bookingId: finalized.args.bookingId,
      finalizedTransaction: finalized.transactionHash,
    },
    timedOutTransaction: timedOut?.transactionHash,
  };
}

/**
 * Ciphertext sizes, by lower-cased supplier address. A relay that is down is not an error: the
 * chain half of the bids panel still reads.
 */
async function readSealedBids(config: Config, auctionId: Hex): Promise<Map<string, number>> {
  try {
    const response = await fetch(`${config.relayUrl}/auctions/${auctionId}/bids`);
    if (!response.ok) {
      return new Map();
    }
    const bids = (await response.json()) as { supplier: string; ciphertext: string }[];
    // A supplier posts the envelope as a `0x` hex string, so two characters are one byte.
    return new Map(
      bids.map((bid) => [
        bid.supplier.toLowerCase(),
        Math.floor(bid.ciphertext.replace(/^0x/, "").length / 2),
      ]),
    );
  } catch {
    return new Map();
  }
}

/** A hash or an address, short enough to read from the back of a room. */
export function short(value: string): string {
  return `${value.slice(0, 10)}…${value.slice(-6)}`;
}

export function formatUsdc(minorUnits: bigint): string {
  return `${formatUnits(minorUnits, USDC_DECIMALS)} USDC`;
}

export function formatTime(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString();
}

export function explorerLink(config: Config, transactionHash: Hex): string | undefined {
  return config.explorerUrl && `${config.explorerUrl}/tx/${transactionHash}`;
}
