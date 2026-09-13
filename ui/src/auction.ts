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
import { sealedAuctionAbi, usdcAbi } from "../../shared/abi.ts";

/** Narrows `eth_getLogs` to this contract's own events, so a busy address costs nothing extra. */
const sealedAuctionEvents = sealedAuctionAbi.filter((entry) => entry.type === "event");

/** `SealedAuction.State`, in declaration order. The read returns the index. */
const STATES = ["None", "Created", "Bidding", "Settling", "Finalized", "Timeout"] as const;

export type AuctionState = (typeof STATES)[number];

/** One on-chain write, as the page shows it: which block it landed in, and what to link to. */
export type Transaction = { hash: Hex; blockNumber: bigint };

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
  createdTransaction: Transaction;
  requirements?: PublicRequirements;
  termsTransaction?: Transaction;
  bidsRoot: Hex;
  claimedTransaction?: Transaction;
  bids: BidRow[];
  /** False when the relay did not answer, which is not the same as a relay holding nothing. */
  relayReachable: boolean;
  settlement?: Settlement;
  timedOutTransaction?: Transaction;
  /** USDC, by lower-cased address, for the escrow, the buyer and every supplier that committed. */
  balances: Map<string, bigint>;
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
  committedTransaction?: Transaction;
  sealedBytes?: number;
};

export type Settlement = {
  winner: Address;
  payout: bigint;
  bookingId: string;
  finalizedTransaction: Transaction;
};

export type Config = {
  rpcUrl: string;
  sealedAuction: Address;
  relayUrl: string;
  purchaserUrl: string;
  explorerUrl?: string;
  fromBlock: bigint;
};

/**
 * Vite inlines anything prefixed `VITE_` into the bundle, so every value here is public by
 * construction. The prefix is the only thing keeping the private keys in the same environment file
 * out of the browser.
 *
 * Missing configuration throws rather than defaulting. A page silently pointed at the wrong chain
 * reads as "the demo is broken".
 */
export function readConfig(env: Record<string, string | undefined>): Config {
  const required = (name: string): string => {
    const value = env[name];
    if (!value) {
      throw new Error(
        `${name} is not set. Run \`set -a; source .env.<network>; set +a\` from the repository root, then start the dev server.`,
      );
    }
    return value;
  };

  return {
    rpcUrl: required("VITE_ARC_RPC_URL"),
    sealedAuction: required("VITE_SEALED_AUCTION_ADDRESS") as Address,
    relayUrl: required("VITE_RELAY_URL").replace(/\/$/, ""),
    purchaserUrl: required("VITE_PURCHASER_URL").replace(/\/$/, ""),
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
  lastBalances?: Map<string, bigint>,
): Promise<AuctionView | null> {
  const logs = parseEventLogs({
    abi: sealedAuctionAbi,
    logs: await client.getLogs({
      address: config.sealedAuction,
      events: sealedAuctionEvents,
      fromBlock: config.fromBlock,
    }),
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
  // The token comes from the contract rather than from configuration: it is immutable there, and a
  // configured address is one more thing that can disagree with the auction it claims to fund.
  const [auction, commitments, committers, bidsRoot, usdc] = await Promise.all([
    client.readContract({ ...contract, functionName: "auctions", args: [auctionId] }),
    client.readContract({ ...contract, functionName: "commitments", args: [auctionId] }),
    client.readContract({ ...contract, functionName: "committers", args: [auctionId] }),
    client.readContract({ ...contract, functionName: "bidsRoot", args: [auctionId] }),
    client.readContract({ ...contract, functionName: "usdc" }),
  ]);

  const terms = find("TermsPublished");
  const claimed = find("AuctionClaimed");
  const finalized = find("AuctionFinalized");
  const timedOut = find("AuctionTimedOut");

  const committed = forThisAuction.filter((log) => log.eventName === "Committed");
  const [sealed, balances] = await Promise.all([
    readSealedBids(config, auctionId),
    readBalances(client, usdc, [config.sealedAuction, auction[1], ...committers], lastBalances),
  ]);

  return {
    auctionId,
    state: STATES[auction[0]] ?? "None",
    buyer: auction[1],
    bidDeadline: Number(auction[3]),
    finalizeDeadline: Number(auction[4]),
    policyHash: auction[5],
    payoutCap: auction[6],
    createdTransaction: transaction(created),
    requirements: terms?.args.requirements,
    termsTransaction: terms && transaction(terms),
    bidsRoot,
    claimedTransaction: claimed && transaction(claimed),
    relayReachable: sealed !== undefined,
    bids: commitments.map((commitment, index) => {
      // By index, not by commitment value: `commit` is once per address, not once per commitment,
      // so a supplier can stake behind a commitment another supplier already placed.
      const supplier = committers[index];
      const log = committed.find((entry) => entry.args.supplier === supplier);
      return {
        commitment,
        supplier,
        committedTransaction: log && transaction(log),
        sealedBytes: supplier ? sealed?.get(supplier.toLowerCase()) : undefined,
      };
    }),
    settlement: finalized && {
      winner: finalized.args.winner,
      payout: finalized.args.payout,
      bookingId: finalized.args.bookingId,
      finalizedTransaction: transaction(finalized),
    },
    timedOutTransaction: timedOut && transaction(timedOut),
    balances,
  };
}

/**
 * One `balanceOf` per address, in one batch of reads.
 *
 * A read that fails keeps the balance the last poll saw, and never rejects: one unreadable address
 * would otherwise fail every poll and freeze the whole page, not just this panel.
 */
async function readBalances(
  client: PublicClient,
  usdc: Address,
  addresses: readonly Address[],
  last?: Map<string, bigint>,
): Promise<Map<string, bigint>> {
  const wanted = [...new Set(addresses.map((address) => address.toLowerCase()))] as Address[];
  const balances = await Promise.all(
    wanted.map(async (address) => {
      try {
        return await client.readContract({
          address: usdc,
          abi: usdcAbi,
          functionName: "balanceOf",
          args: [address],
        });
      } catch {
        return last?.get(address);
      }
    }),
  );

  return new Map(
    wanted.flatMap((address, index) => {
      const balance = balances[index];
      return balance === undefined ? [] : [[address, balance] as const];
    }),
  );
}

/** A log carries both halves of a transaction row, so nothing has to be read back per hash. */
function transaction(log: { transactionHash: Hex; blockNumber: bigint }): Transaction {
  return { hash: log.transactionHash, blockNumber: log.blockNumber };
}

/**
 * Ciphertext sizes, by lower-cased supplier address, or `undefined` when the relay did not answer.
 * The two cases have to stay apart: an empty map says no supplier sealed a bid, which is a claim
 * the page cannot make about a relay it never reached.
 */
async function readSealedBids(
  config: Config,
  auctionId: Hex,
): Promise<Map<string, number> | undefined> {
  try {
    const response = await fetch(`${config.relayUrl}/auctions/${auctionId}/bids`);
    if (!response.ok) {
      return undefined;
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
    return undefined;
  }
}

/** A hash or an address, short enough to read from the back of a room. */
export function short(value: string): string {
  return `${value.slice(0, 10)}…${value.slice(-6)}`;
}

/** Shorter again, for the stepper, where four of these share the width of one panel. */
export function shorter(value: string): string {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
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
