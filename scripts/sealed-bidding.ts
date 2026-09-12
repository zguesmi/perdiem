/**
 * Opens one auction against the reference policy and waits for three sealed bids.
 *
 * It is the buyer's half of the sealed bidding flow, minus the parts that are not built yet: the
 * policy is `referencePolicy` rather than one a model wrote, and a plain viem account signs rather
 * than the Privy organization wallet. What it does prove is the privacy claim: three commitments
 * land on chain, three ciphertexts land at the relay, and no readable bid exists anywhere.
 *
 * The suppliers have to be listening before the auction opens, because they read it from
 * `TermsPublished` and never derive an identifier. `scripts/demo-sealed-bidding.sh` starts them.
 */
import assert from "node:assert/strict";
import { createPublicClient, createWalletClient, erc20Abi, http, parseEventLogs } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";

import { sealedAuctionAbi } from "../shared/abi.ts";
import { addressSchema } from "../shared/bid.ts";
import { arc } from "../shared/chain.ts";
import { hashPolicy } from "../shared/policy-hash.ts";
import { publicRequirements } from "../shared/policy.ts";
import { referencePolicy } from "../shared/reference-policy.ts";

/**
 * USDC the buyer locks, in minor units. It is padded above the policy's maximum price of 520, so
 * that the public `transferFrom` does not publish the ceiling.
 */
const PAYOUT_CAP = 750_000_000n;

/** How many suppliers this run waits for, and how long it waits before it gives up. */
const SUPPLIERS = 3;
const DEADLINE_MILLISECONDS = 120_000;
const POLL_MILLISECONDS = 2_000;

const environment = z
  .object({
    ARC_RPC_URL: z.url(),
    RELAY_URL: z.url(),
    SEALED_AUCTION_ADDRESS: addressSchema,
    USDC_ADDRESS: addressSchema,
    BUYER_PRIVATE_KEY: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  })
  .parse(process.env);

const sealedAuction = environment.SEALED_AUCTION_ADDRESS;
const account = privateKeyToAccount(environment.BUYER_PRIVATE_KEY as `0x${string}`);
const chain = arc(environment.ARC_RPC_URL);
const transport = http(environment.ARC_RPC_URL);
const reader = createPublicClient({ chain, transport });
const buyer = createWalletClient({ account, chain, transport });

/** Sends one call and fails the run on a revert, which viem otherwise resolves as a success. */
async function send(call: {
  address: `0x${string}`;
  abi: readonly unknown[];
  functionName: string;
  args: readonly unknown[];
}): Promise<`0x${string}`> {
  const hash = await buyer.writeContract({ ...call, abi: call.abi as never } as never);
  const receipt = await reader.waitForTransactionReceipt({ hash });
  assert.equal(receipt.status, "success", `${call.functionName} reverted on chain`);
  return hash;
}

const policyHash = hashPolicy(referencePolicy);
console.log(`policy hash        ${policyHash}`);

const approved = await send({
  address: environment.USDC_ADDRESS,
  abi: erc20Abi,
  functionName: "approve",
  args: [sealedAuction, PAYOUT_CAP],
});
console.log(`approve            ${approved}`);

const opened = await send({
  address: sealedAuction,
  abi: sealedAuctionAbi,
  functionName: "createAuction",
  args: [policyHash, publicRequirements(referencePolicy), PAYOUT_CAP],
});
const receipt = await reader.waitForTransactionReceipt({ hash: opened });
console.log(`createAuction      ${opened}`);

// The identifier is read from the log, not derived. It hashes the whole auction record, deadlines
// included, so only the chain knows it.
const [created] = parseEventLogs({
  abi: sealedAuctionAbi,
  eventName: "AuctionCreated",
  logs: receipt.logs,
});
assert.ok(created, "createAuction emitted no AuctionCreated");
const auctionId = created.args.auctionId;
console.log(`auction            ${auctionId}`);

const sealedBidsSchema = z.array(z.object({ supplier: z.string(), ciphertext: z.string() }));

/** The relay is blind, so this asks it for bytes and never for a bid. */
async function sealedBids(): Promise<{ status: number; bids: z.infer<typeof sealedBidsSchema> }> {
  const answer = await fetch(`${environment.RELAY_URL}/auctions/${auctionId}/bids`);
  return {
    status: answer.status,
    bids: answer.ok ? sealedBidsSchema.parse(await answer.json()) : [],
  };
}

const giveUpAt = Date.now() + DEADLINE_MILLISECONDS;
let reported = "";
let commitments: readonly `0x${string}`[] = [];
let relay = await sealedBids();

while (commitments.length < SUPPLIERS || relay.bids.length < SUPPLIERS) {
  if (Date.now() > giveUpAt) {
    console.error(
      `only ${commitments.length} commitments and ${relay.bids.length} sealed bids after ${DEADLINE_MILLISECONDS / 1000}s`,
    );
    process.exit(1);
  }

  await new Promise((resolve) => setTimeout(resolve, POLL_MILLISECONDS));
  commitments = await reader.readContract({
    address: sealedAuction,
    abi: sealedAuctionAbi,
    functionName: "commitments",
    args: [auctionId],
  });
  relay = await sealedBids();

  // One line per arrival, not one per poll. A run with nothing happening says so once.
  const arrived = `${commitments.length}/${SUPPLIERS} commitments, ${relay.bids.length}/${SUPPLIERS} sealed bids (relay ${relay.status})`;
  if (arrived !== reported) {
    console.log(`waiting            ${arrived}`);
    reported = arrived;
  }
}

const committers = await reader.readContract({
  address: sealedAuction,
  abi: sealedAuctionAbi,
  functionName: "committers",
  args: [auctionId],
});

console.log();
for (const [index, commitment] of commitments.entries()) {
  const sealed = relay.bids.find(
    (bid) => bid.supplier.toLowerCase() === committers[index]?.toLowerCase(),
  );
  assert.ok(sealed, `${committers[index]} committed and posted no sealed bid`);
  // The ciphertext is hex and nothing else. A readable bid here would leak the salt, and the bid
  // space is small enough that keccak256 brute-forces the commitment without it.
  assert.match(sealed.ciphertext, /^0x[0-9a-f]+$/);
  console.log(
    `supplier           ${committers[index]}  commitment ${commitment}  sealed ${(sealed.ciphertext.length - 2) / 2} bytes`,
  );
}

console.log();
console.log(`${SUPPLIERS} commitments on chain, ${SUPPLIERS} ciphertexts at the relay, no readable bid.`);
