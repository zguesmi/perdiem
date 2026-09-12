import { serve } from "@hono/node-server";
import { z } from "zod";

import { addressSchema } from "../../shared/bid.ts";
import { createPurchaserApp } from "./app.ts";
import { createFunder } from "./funding.ts";
import { createIntentAgent } from "./intent.ts";
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
    /** USDC minor units. Padded above the policy's maximum price, which stays off the chain. */
    PAYOUT_CAP: z.coerce.bigint().positive(),

    PRIVY_APP_ID: z.string().min(1),
    PRIVY_APP_SECRET: z.string().min(1),
    PRIVY_WALLET_ID: z.string().min(1),
    /** At or below this many USDC minor units, the spend policy authorizes on its own. */
    PRIVY_QUORUM_CEILING: z.coerce.bigint().nonnegative(),
    PRIVY_SERVER_KEYS: keys,
    PRIVY_QUORUM_KEYS: keys,
  })
  .parse(process.env);

const wallet = createPrivyWallet({
  appId: environment.PRIVY_APP_ID,
  appSecret: environment.PRIVY_APP_SECRET,
  walletId: environment.PRIVY_WALLET_ID,
});

const app = createPurchaserApp({
  intentAgent: createIntentAgent(environment.INTENT_MODEL),
  payoutCap: environment.PAYOUT_CAP,
  funder: createFunder({
    wallet,
    rpcUrl: environment.ARC_RPC_URL,
    sealedAuction: environment.SEALED_AUCTION_ADDRESS,
    payoutCap: environment.PAYOUT_CAP,
    quorumCeiling: environment.PRIVY_QUORUM_CEILING,
    serverKeys: environment.PRIVY_SERVER_KEYS,
    quorumKeys: environment.PRIVY_QUORUM_KEYS,
  }),
});

serve({ fetch: app.fetch, port: environment.PURCHASER_PORT }, (info) => {
  console.log(`Purchaser service listening on http://localhost:${info.port}`);
  console.log(`Intent parsing runs on ${environment.INTENT_MODEL}`);
});
