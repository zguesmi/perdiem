import { createPublicClient, encodeFunctionData, http } from "viem";
import { z } from "zod";

import { sealedAuctionAbi, usdcAbi } from "../../shared/abi.ts";
import { addressSchema } from "../../shared/bid.ts";
import { arc, ARC_CHAIN_ID } from "../../shared/chain.ts";
import { createPrivyWallet, type PrivyTransaction } from "../src/privy.ts";

/**
 * The buyer wallet's spend policy: what the organization lets its server sign, and nothing more.
 *
 * ```sh
 * pnpm --filter @perdiem/purchaser privy:policy create   # prints a policy id to attach
 * pnpm --filter @perdiem/purchaser privy:policy probe    # asks for what the policy refuses
 * ```
 *
 * Both rules read the calldata rather than the destination address. A rule on the destination
 * alone would allow any call to the USDC token, an `approve` to a different spender included, and
 * that one approval is enough to drain the wallet.
 *
 * Both also cap the amount. The approval is the first of the two transactions, so a cap only on
 * `createAuction` would let the approval mine before the refusal, leaving a standing allowance
 * behind a confirmation the organization turned down.
 */
const environment = z
  .object({
    PRIVY_APP_ID: z.string().min(1),
    PRIVY_APP_SECRET: z.string().min(1),
    PRIVY_WALLET_ID: z.string().min(1),
    PRIVY_QUORUM_WALLET_ID: z.string().min(1),
    PRIVY_QUORUM_KEYS: z.string().min(1),
    ARC_RPC_URL: z.url(),
    SEALED_AUCTION_ADDRESS: addressSchema,
    MAX_PAYOUT_CAP: z.coerce.bigint().positive(),
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

const sealedAuction = environment.SEALED_AUCTION_ADDRESS;

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
          value: sealedAuction,
        },
        {
          field_source: "ethereum_calldata",
          field: "approve.value",
          abi: usdcAbi,
          operator: "lte",
          value: String(environment.MAX_PAYOUT_CAP),
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
          value: sealedAuction,
        },
        {
          field_source: "ethereum_calldata",
          field: "createAuction.payoutCap",
          abi: sealedAuctionAbi,
          operator: "lte",
          value: String(environment.MAX_PAYOUT_CAP),
        },
      ],
      action: "ALLOW",
    },
  ],
};

/** The demo's public requirements. The policy reads the payout cap beside them and nothing else. */
const demoRequirements = {
  city: "Paris",
  checkin: "2026-10-12",
  checkout: "2026-10-14",
  minStars: 4,
  roomType: "double",
  numberOfRooms: 1,
  tradeDownStars: 3,
} as const;

/** A spender the policy never names. One approval to it is enough to drain the wallet. */
const wrongSpender = `0x${"de".repeat(20)}` as const;

const quorumKeys = environment.PRIVY_QUORUM_KEYS.split(",").filter((key) => key !== "");

function organizationWallet(walletId: string) {
  return createPrivyWallet({
    appId: environment.PRIVY_APP_ID,
    appSecret: environment.PRIVY_APP_SECRET,
    walletId,
  });
}

const policyWallet = organizationWallet(environment.PRIVY_WALLET_ID);
const quorumWallet = organizationWallet(environment.PRIVY_QUORUM_WALLET_ID);

function request(to: `0x${string}`, data: `0x${string}`) {
  return {
    to,
    data,
    chain_id: ARC_CHAIN_ID,
    nonce: 0,
    gas_limit: "0x30000",
    max_fee_per_gas: "0x6fc23ac00",
    max_priority_fee_per_gas: "0x3b9aca00",
    value: "0x0",
    type: 2,
  } as const satisfies PrivyTransaction;
}

const approve = (spender: `0x${string}`, value: bigint) =>
  request(usdc, encodeFunctionData({ abi: usdcAbi, functionName: "approve", args: [spender, value] }));

const createAuction = (payoutCap: bigint) =>
  request(
    sealedAuction,
    encodeFunctionData({
      abi: sealedAuctionAbi,
      functionName: "createAuction",
      args: [`0x${"11".repeat(32)}`, demoRequirements, payoutCap],
    }),
  );

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
  // Every row is a signature request and nothing is broadcast, so the answers cost no gas and
  // change no state. The gas figures are fixed rather than estimated: `createAuction` reverts
  // until the approval it needs is mined, and an estimate is not what the policy reads anyway.
  const cases = [
    ["approve 250 to the auction", policyWallet, approve(sealedAuction, 250_000_000n), [], "signed"],
    ["approve the maximum cap to a spender the policy never names", policyWallet, approve(wrongSpender, environment.MAX_PAYOUT_CAP), [], "refused"],
    [`createAuction above the maximum cap`, policyWallet, createAuction(environment.MAX_PAYOUT_CAP + 1n), [], "refused"],
    ["approve the maximum cap, no quorum signature", quorumWallet, approve(sealedAuction, environment.MAX_PAYOUT_CAP), [], "refused"],
    ["approve the maximum cap, one quorum signature", quorumWallet, approve(sealedAuction, environment.MAX_PAYOUT_CAP), quorumKeys.slice(0, 1), "refused"],
    ["approve the maximum cap, both quorum signatures", quorumWallet, approve(sealedAuction, environment.MAX_PAYOUT_CAP), quorumKeys, "signed"],
    ["createAuction at the maximum cap, both quorum signatures", quorumWallet, createAuction(environment.MAX_PAYOUT_CAP), quorumKeys, "signed"],
    ["createAuction above the maximum cap, both quorum signatures", quorumWallet, createAuction(environment.MAX_PAYOUT_CAP + 1n), quorumKeys, "refused"],
  ] as const;

  let broken = 0;

  for (const [what, signer, request, keys, expected] of cases) {
    const answer = await signer.signTransaction(request, keys).then(
      (rlp) => ({ outcome: "signed" as const, detail: rlp }),
      (refusal: unknown) => ({ outcome: "refused" as const, detail: String(refusal) }),
    );

    broken += answer.outcome === expected ? 0 : 1;
    const mark = answer.outcome === expected ? "ok" : "NOT AS STATED";
    console.log(`${mark}  ${signer === quorumWallet ? "quorum wallet" : "policy wallet"}: ${what}`);
    console.log(`    ${answer.detail}`);
  }

  // A policy that signs what it is meant to refuse passes every other check, so the exit code is
  // the only thing standing between a broken policy and a green run.
  if (broken > 0) {
    console.error(`${broken} of ${cases.length} answers were not what the policy states.`);
    process.exit(1);
  }
} else {
  console.error("usage: privy-policy.ts create|probe");
  process.exit(1);
}
