import {
  createPublicClient,
  encodeFunctionData,
  http,
  numberToHex,
  parseEventLogs,
  type TransactionReceipt,
} from "viem";

import { sealedAuctionAbi, usdcAbi } from "../../shared/abi.ts";
import { arc, ARC_CHAIN_ID } from "../../shared/chain.ts";
import type { PublicRequirements } from "../../shared/policy.ts";
import type { PrivyTransaction, PrivyWallet } from "./privy.ts";

/** What the buyer gets back once the money is locked. Every field is a thing the page shows. */
export interface Funding {
  auctionId: `0x${string}`;
  approveHash: `0x${string}`;
  createAuctionHash: `0x${string}`;
  /** True when the payout cap put this auction above the ceiling and the key quorum signed. */
  quorumSigned: boolean;
}

export interface FunderOptions {
  /** The wallet with no owner: its spend policy is the whole authorization. */
  wallet: PrivyWallet;
  /** The wallet owned by the key quorum. Every request to it carries both approvals. */
  quorumWallet: PrivyWallet;
  rpcUrl: string;
  sealedAuction: `0x${string}`;
  /** The largest cap the spend policy will sign. Privy refuses anything above it. */
  maxPayoutCap: bigint;
  /** At or below this many USDC minor units the spend policy authorizes alone. */
  quorumCeiling: bigint;
  /** Authorization keys for a payout cap at or under the ceiling. Empty means the policy alone. */
  serverKeys: readonly string[];
  /** The travel manager and finance. Both sign anything above the ceiling. */
  quorumKeys: readonly string[];
}

export type Funder = (
  policyHash: `0x${string}`,
  requirements: PublicRequirements,
  payoutCap: bigint,
) => Promise<Funding>;

/**
 * The cap for one policy: the next whole bucket strictly above its maximum price.
 *
 * Strictly, so a maximum price that lands on a bucket boundary is padded to the next one. The cap
 * is emitted in `TermsPublished`, and a cap equal to the maximum price publishes the ceiling the
 * policy exists to keep private.
 *
 * The bucket is what the cap leaks: a reader learns which band the maximum price falls in and
 * nothing sharper. A cap derived by adding a fixed pad would leak the price exactly.
 */
export function payoutCapFor(maxPrice: bigint, bucket: bigint): bigint {
  return (maxPrice / bucket + 1n) * bucket;
}

/**
 * Which wallet funds this auction and who authorizes it, decided by the payout cap and nothing
 * else.
 *
 * Above the ceiling the key quorum approves: the travel manager and finance both sign the request.
 * At or below it the wallet's spend policy is the whole authorization, so the key list is normally
 * empty. The cap is known before any request leaves, so the choice is made once per auction.
 *
 * It is two wallets because a Privy wallet has one owner. A quorum-owned wallet needs both
 * approvals on every request, which leaves no path the spend policy authorizes on its own.
 *
 * A quorum with no keys is refused rather than reported. Privy would answer the request on the
 * spend policy alone and the page would show two approvals that nobody gave.
 */
export function signerFor(options: {
  payoutCap: bigint;
  quorumCeiling: bigint;
  wallet: PrivyWallet;
  quorumWallet: PrivyWallet;
  serverKeys: readonly string[];
  quorumKeys: readonly string[];
}): { wallet: PrivyWallet; keys: readonly string[]; quorumSigned: boolean } {
  const quorumSigned = options.payoutCap > options.quorumCeiling;

  if (quorumSigned && options.quorumKeys.length === 0) {
    throw new Error("a payout cap above the ceiling needs quorum keys to sign it");
  }

  return quorumSigned
    ? { wallet: options.quorumWallet, keys: options.quorumKeys, quorumSigned }
    : { wallet: options.wallet, keys: options.serverKeys, quorumSigned };
}

/**
 * Locks the payout cap in escrow and opens the auction.
 *
 * It is two signed transactions and not one, because `createAuction` pulls the cap with
 * `transferFrom`. Sequential and not batched: the approval has to be mined before the pull can be
 * estimated, let alone succeed.
 */
export function createFunder(options: FunderOptions): Funder {
  const client = createPublicClient({ chain: arc(options.rpcUrl), transport: http(options.rpcUrl) });

  // The cap is per-auction now, so the signer is chosen per call. The largest cap the spend policy
  // allows still settles at startup whether a quorum can ever be needed.
  signerFor({ ...options, payoutCap: options.maxPayoutCap });

  return async (policyHash, requirements, payoutCap) => {
    const { wallet, keys: authorizationKeys, quorumSigned } = signerFor({ ...options, payoutCap });
    const from = await wallet.address();
    const usdc = await client.readContract({
      address: options.sealedAuction,
      abi: sealedAuctionAbi,
      functionName: "usdc",
    });

    /** Signs one call with Privy, sends the RLP to Arc, and throws unless it is mined. */
    async function send(to: `0x${string}`, data: `0x${string}`): Promise<TransactionReceipt> {
      const [nonce, fees, gas] = await Promise.all([
        client.getTransactionCount({ address: from, blockTag: "pending" }),
        client.estimateFeesPerGas(),
        client.estimateGas({ account: from, to, data }),
      ]);

      const transaction: PrivyTransaction = {
        to,
        data,
        chain_id: ARC_CHAIN_ID,
        nonce,
        gas_limit: numberToHex(gas),
        max_fee_per_gas: numberToHex(fees.maxFeePerGas),
        max_priority_fee_per_gas: numberToHex(fees.maxPriorityFeePerGas),
        value: "0x0",
        type: 2,
      };

      const serializedTransaction = await wallet.signTransaction(transaction, authorizationKeys);
      const hash = await client.sendRawTransaction({ serializedTransaction });
      const receipt = await client.waitForTransactionReceipt({ hash });

      if (receipt.status !== "success") {
        throw new Error(`funding transaction ${hash} reverted`);
      }
      return receipt;
    }

    const approved = await send(
      usdc,
      encodeFunctionData({
        abi: usdcAbi,
        functionName: "approve",
        args: [options.sealedAuction, payoutCap],
      }),
    );

    const created = await send(
      options.sealedAuction,
      encodeFunctionData({
        abi: sealedAuctionAbi,
        functionName: "createAuction",
        args: [policyHash, requirements, payoutCap],
      }),
    );

    // The identifier is read from the log rather than recomputed. It hashes the whole auction
    // record, including two deadlines the contract derived from the block it landed in.
    const [event] = parseEventLogs({
      abi: sealedAuctionAbi,
      eventName: "AuctionCreated",
      logs: created.logs,
    });

    if (!event) {
      throw new Error("createAuction emitted no AuctionCreated event");
    }

    return {
      auctionId: event.args.auctionId,
      approveHash: approved.transactionHash,
      createAuctionHash: created.transactionHash,
      quorumSigned,
    };
  };
}
