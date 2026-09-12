import { serve } from "@hono/node-server";
import { createPublicClient, hexToBytes, http } from "viem";
import { z } from "zod";

import { sealedAuctionAbi } from "../../shared/abi.ts";
import { addressSchema } from "../../shared/bid.ts";
import { arc } from "../../shared/chain.ts";
import { createPurchaserApp } from "./app.ts";
import { createFunder } from "./funding.ts";
import { createIntentAgent } from "./intent.ts";
import { createPolicyUploader } from "./policy-upload.ts";
import { createPrivyWallet } from "./privy.ts";

/** A comma-separated list of authorization keys, in the order the quorum expects them. */
const keys = z
  .string()
  .default("")
  .transform((value) =>
    value
      .split(",")
      .map((key) => key.trim())
      .filter((key) => key !== ""),
  );

const environment = z
  .object({
    PURCHASER_PORT: z.coerce.number().int().positive().default(8788),
    INTENT_MODEL: z.string().min(1).default("claude-opus-5"),
    ANTHROPIC_API_KEY: z.string().min(1),

    ARC_RPC_URL: z.url(),
    SEALED_AUCTION_ADDRESS: addressSchema,
    RELAY_URL: z.url(),
    /**
     * The step the payout cap is rounded up to, and the largest cap the spend policy will sign.
     * Both in USDC minor units. Privy refuses a `createAuction` above the maximum.
     */
    PAYOUT_CAP_BUCKET: z.coerce.bigint().positive(),
    MAX_PAYOUT_CAP: z.coerce.bigint().positive(),

    PRIVY_APP_ID: z.string().min(1),
    PRIVY_APP_SECRET: z.string().min(1),
    PRIVY_WALLET_ID: z.string().min(1),
    PRIVY_QUORUM_WALLET_ID: z.string().min(1),
    /** At or below this many USDC minor units, the spend policy authorizes on its own. */
    PRIVY_QUORUM_CEILING: z.coerce.bigint().nonnegative(),
    PRIVY_SERVER_KEYS: keys,
    PRIVY_QUORUM_KEYS: keys,
  })
  .parse(process.env);

/** A Privy wallet has one owner, so the quorum needs a wallet of its own. */
function organizationWallet(walletId: string) {
  return createPrivyWallet({
    appId: environment.PRIVY_APP_ID,
    appSecret: environment.PRIVY_APP_SECRET,
    walletId,
  });
}

/** One keypair per deployment, so the public half is read once at start and never again. */
const enclavePublicKey = await createPublicClient({
  chain: arc(environment.ARC_RPC_URL),
  transport: http(environment.ARC_RPC_URL),
}).readContract({
  address: environment.SEALED_AUCTION_ADDRESS,
  abi: sealedAuctionAbi,
  functionName: "enclavePublicKey",
});

const app = createPurchaserApp({
  intentAgent: createIntentAgent(environment.INTENT_MODEL),
  uploadPolicy: createPolicyUploader(environment.RELAY_URL),
  enclavePublicKey: hexToBytes(enclavePublicKey),
  payoutCapBucket: environment.PAYOUT_CAP_BUCKET,
  funder: createFunder({
    wallet: organizationWallet(environment.PRIVY_WALLET_ID),
    quorumWallet: organizationWallet(environment.PRIVY_QUORUM_WALLET_ID),
    rpcUrl: environment.ARC_RPC_URL,
    sealedAuction: environment.SEALED_AUCTION_ADDRESS,
    maxPayoutCap: environment.MAX_PAYOUT_CAP,
    quorumCeiling: environment.PRIVY_QUORUM_CEILING,
    serverKeys: environment.PRIVY_SERVER_KEYS,
    quorumKeys: environment.PRIVY_QUORUM_KEYS,
  }),
});

serve({ fetch: app.fetch, port: environment.PURCHASER_PORT }, (info) => {
  console.log(`Purchaser service listening on http://localhost:${info.port}`);
  console.log(`Intent parsing runs on ${environment.INTENT_MODEL}`);
});
