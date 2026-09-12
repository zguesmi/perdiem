import { createPublicClient, encodeFunctionData, http, numberToHex } from "viem";
import { z } from "zod";

import { sealedAuctionAbi, usdcAbi } from "../../shared/abi.ts";
import { addressSchema } from "../../shared/bid.ts";
import { arc, ARC_CHAIN_ID } from "../../shared/chain.ts";
import { createPrivyWallet } from "../src/privy.ts";

/**
 * The buyer wallet's spend policy: what the organization lets its server sign, and nothing more.
 *
 * ```sh
 * pnpm --filter @perdiem/purchaser privy:policy create   # prints a policy id to attach
 * pnpm --filter @perdiem/purchaser privy:policy probe    # shows an approve to a wrong spender fail
 * ```
 *
 * Both rules read the calldata rather than the destination address. A rule on the destination
 * alone would allow any call to the USDC token, an `approve` to a different spender included, and
 * that one approval is enough to drain the wallet.
 */
const environment = z
  .object({
    PRIVY_APP_ID: z.string().min(1),
    PRIVY_APP_SECRET: z.string().min(1),
    PRIVY_WALLET_ID: z.string().min(1),
    ARC_RPC_URL: z.url(),
    SEALED_AUCTION_ADDRESS: addressSchema,
    PAYOUT_CAP: z.coerce.bigint().positive(),
  })
  .parse(process.env);

const client = createPublicClient({
  chain: arc(environment.ARC_RPC_URL),
  transport: http(environment.ARC_RPC_URL),
});

// Read from the escrow rather than from the environment: the token the contract pulls with is the
// only token an approval is worth granting.
const usdc = await client.readContract({
  address: environment.SEALED_AUCTION_ADDRESS,
  abi: sealedAuctionAbi,
  functionName: "usdc",
});

/** Every rule pins the chain, so a signature made here is worthless anywhere else. */
const onArc = {
  field_source: "ethereum_transaction",
  field: "chain_id",
  operator: "eq",
  value: String(ARC_CHAIN_ID),
} as const;

const policy = {
  version: "1.0",
  name: "Hotel booking conditions",
  chain_type: "ethereum",
  rules: [
    {
      name: "Allow only auction contract to transfer USDC",
      method: "eth_signTransaction",
      conditions: [
        onArc,
        { field_source: "ethereum_transaction", field: "to", operator: "eq", value: usdc },
        {
          field_source: "ethereum_calldata",
          field: "approve.spender",
          abi: usdcAbi,
          operator: "eq",
          value: environment.SEALED_AUCTION_ADDRESS,
        },
      ],
      action: "ALLOW",
    },
    {
      name: "Open an auction within the budget",
      method: "eth_signTransaction",
      conditions: [
        onArc,
        {
          field_source: "ethereum_transaction",
          field: "to",
          operator: "eq",
          value: environment.SEALED_AUCTION_ADDRESS,
        },
        {
          field_source: "ethereum_calldata",
          field: "createAuction.payoutCap",
          abi: sealedAuctionAbi,
          operator: "lte",
          value: String(environment.PAYOUT_CAP),
        },
      ],
      action: "ALLOW",
    },
  ],
};

const command = process.argv[2];

if (command === "create") {
  const response = await fetch("https://api.privy.io/v1/policies", {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${environment.PRIVY_APP_ID}:${environment.PRIVY_APP_SECRET}`).toString("base64")}`,
      "privy-app-id": environment.PRIVY_APP_ID,
      "content-type": "application/json",
    },
    body: JSON.stringify(policy),
  });

  console.log(response.status, await response.text());
} else if (command === "probe") {
  // The refusal this prints is the point: an approve the policy does not name is not signed.
  const wallet = createPrivyWallet({
    appId: environment.PRIVY_APP_ID,
    appSecret: environment.PRIVY_APP_SECRET,
    walletId: environment.PRIVY_WALLET_ID,
  });

  const buyer = await wallet.address();
  const data = encodeFunctionData({
    abi: usdcAbi,
    functionName: "approve",
    args: [`0x${"de".repeat(20)}`, environment.PAYOUT_CAP],
  });
  const [nonce, fees, gas] = await Promise.all([
    client.getTransactionCount({ address: buyer, blockTag: "pending" }),
    client.estimateFeesPerGas(),
    client.estimateGas({ account: buyer, to: usdc, data }),
  ]);

  const signed = await wallet
    .signTransaction(
      {
        to: usdc,
        data,
        chain_id: ARC_CHAIN_ID,
        nonce,
        gas_limit: numberToHex(gas),
        max_fee_per_gas: numberToHex(fees.maxFeePerGas),
        max_priority_fee_per_gas: numberToHex(fees.maxPriorityFeePerGas),
        value: "0x0",
        type: 2,
      },
      [],
    )
    .then(
      (rlp) => rlp,
      (refusal: unknown) => {
        console.log(String(refusal));
        return undefined;
      },
    );

  // The refusal is the result this script exists for, so signing is the failure. Exiting zero on
  // it would let a policy that allows any spender pass for a policy that refuses one.
  if (signed !== undefined) {
    console.error(`NOT REFUSED. The policy signed an approve to a spender it never named: ${signed}`);
    process.exit(1);
  }
} else {
  console.error("usage: privy-policy.ts create|probe");
  process.exit(1);
}
