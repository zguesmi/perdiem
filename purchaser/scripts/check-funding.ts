import assert from "node:assert/strict";
import { createPublicClient, erc20Abi, formatUnits, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";

import { sealedAuctionAbi } from "../../shared/abi.ts";
import { addressSchema } from "../../shared/bid.ts";
import { arc, USDC_DECIMALS } from "../../shared/chain.ts";
import { hashPolicy } from "../../shared/policy-hash.ts";
import { publicRequirements } from "../../shared/policy.ts";
import { referencePolicy } from "../../shared/reference-policy.ts";
import { createFunder, payoutCapFor } from "../src/funding.ts";
import { PolicyRefusedError, type PrivyWallet } from "../src/privy.ts";

/**
 * Runs the funding flow against a local node.
 *
 * Everything but Privy is real: the calldata, the two nonces, the gas estimates, the broadcast, the
 * receipts and the identifier read back from `AuctionCreated`. A local account stands in for the
 * organization wallet, because Privy is a remote service and signs for Arc alone.
 *
 * ```sh
 * cd onchain && npx hardhat node --chain-id 5042002       # one terminal
 * npx hardhat run scripts/deploy.ts --network localhost    # another
 * set -a; source .env.localhost; set +a
 * pnpm --filter @perdiem/purchaser check:funding
 * ```
 */
const environment = z
  .object({
    ARC_RPC_URL: z.url(),
    SEALED_AUCTION_ADDRESS: addressSchema,
    BUYER_PRIVATE_KEY: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
    PAYOUT_CAP_BUCKET: z.coerce.bigint().positive(),
  })
  .parse(process.env);

const account = privateKeyToAccount(environment.BUYER_PRIVATE_KEY as `0x${string}`);
const client = createPublicClient({
  chain: arc(environment.ARC_RPC_URL),
  transport: http(environment.ARC_RPC_URL),
});

/** The organization wallet, minus Privy. It returns the signed RLP that `/v1/wallets` returns. */
const wallet: PrivyWallet = {
  address: async () => account.address,
  signTransaction: async (transaction) =>
    account.signTransaction({
      chainId: transaction.chain_id,
      to: transaction.to,
      data: transaction.data,
      nonce: transaction.nonce,
      gas: BigInt(transaction.gas_limit),
      maxFeePerGas: BigInt(transaction.max_fee_per_gas),
      maxPriorityFeePerGas: BigInt(transaction.max_priority_fee_per_gas),
      value: 0n,
      type: "eip1559",
    }),
};

/** The same wallet under a spend policy that turns the request down. */
const refusingWallet: PrivyWallet = {
  address: wallet.address,
  signTransaction: async () => {
    throw new PolicyRefusedError("RPC request denied due to policy violation");
  },
};

const payoutCap = payoutCapFor(BigInt(referencePolicy.maxPrice), environment.PAYOUT_CAP_BUCKET);
const policyHash = hashPolicy(referencePolicy);
const requirements = publicRequirements(referencePolicy);

const usdc = (amount: bigint) => `${formatUnits(amount, USDC_DECIMALS)} USDC`;

const usdcAddress = await client.readContract({
  address: environment.SEALED_AUCTION_ADDRESS,
  abi: sealedAuctionAbi,
  functionName: "usdc",
});

const escrowBalance = () =>
  client.readContract({
    address: usdcAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [environment.SEALED_AUCTION_ADDRESS],
  });

function funderWith(signer: PrivyWallet) {
  return createFunder({
    wallet: signer,
    rpcUrl: environment.ARC_RPC_URL,
    sealedAuction: environment.SEALED_AUCTION_ADDRESS,
    maxPayoutCap: payoutCap,
    // Everything here sits under the ceiling, so the spend policy would authorize alone.
    quorumCeiling: payoutCap,
    serverKeys: [],
    quorumKeys: [],
  });
}

console.log(`buyer              ${account.address}`);
console.log(`maximum price      ${usdc(BigInt(referencePolicy.maxPrice))}`);
console.log(`payout cap         ${usdc(payoutCap)}`);
assert.ok(payoutCap > BigInt(referencePolicy.maxPrice), "the cap must sit above the maximum price");

console.log("\n1. the organization funds the auction");

const before = await escrowBalance();
const funding = await funderWith(wallet)(policyHash, requirements, payoutCap);

console.log(`approve            ${funding.approveHash}`);
console.log(`createAuction      ${funding.createAuctionHash}`);
console.log(`auction            ${funding.auctionId}`);

// The chain is the judge. An identifier the page shows but the contract never stored is a bug the
// receipts alone would not catch.
const auction = await client.readContract({
  address: environment.SEALED_AUCTION_ADDRESS,
  abi: sealedAuctionAbi,
  functionName: "auctions",
  args: [funding.auctionId],
});

assert.equal(auction[0], 1, "the auction should be in Created");
assert.equal(auction[1].toLowerCase(), account.address.toLowerCase(), "buyer");
assert.equal(auction[5], policyHash, "policy hash");
assert.equal(auction[6], payoutCap, "payout cap");

const funded = await escrowBalance();
assert.equal(funded - before, payoutCap, "the escrow should hold exactly the cap");
console.log(`escrow received    ${usdc(funded - before)}`);

console.log("\n2. the organization refuses, and nothing reaches the chain");

// The spend policy caps the amount on both rules. A rule only on `createAuction` would let the
// approval mine first and leave a standing allowance behind a refused confirmation.
const allowanceBefore = await client.readContract({
  address: usdcAddress,
  abi: erc20Abi,
  functionName: "allowance",
  args: [account.address, environment.SEALED_AUCTION_ADDRESS],
});
const nonceBefore = await client.getTransactionCount({ address: account.address });

await assert.rejects(
  () => funderWith(refusingWallet)(policyHash, requirements, payoutCap),
  PolicyRefusedError,
);

assert.equal(
  await client.getTransactionCount({ address: account.address }),
  nonceBefore,
  "a refused funding must broadcast nothing",
);
assert.equal(
  await client.readContract({
    address: usdcAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: [account.address, environment.SEALED_AUCTION_ADDRESS],
  }),
  allowanceBefore,
  "a refused funding must leave no allowance behind",
);
assert.equal(await escrowBalance(), funded, "a refused funding must move no USDC");

console.log("nonce, allowance and escrow balance all unchanged");

console.log("\nOK");
