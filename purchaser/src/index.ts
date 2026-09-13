import { serve } from "@hono/node-server";
import { createPublicClient, hexToBytes, http } from "viem";
import { z } from "zod";

import { sealedAuctionAbi } from "../../shared/abi.ts";
import { addressSchema } from "../../shared/bid.ts";
import { arc, ARC_CHAIN_ID } from "../../shared/chain.ts";
import { banner, coral, cyan, describeError, green, group, red, yellow } from "../../shared/log.ts";
import { createPurchaserApp } from "./app.ts";
import { createFunder } from "./funding.ts";
import { createPolicyAgent, policyAgentRole, VALIDATE_POLICY } from "./policy-agent.ts";
import { createPolicyUploader } from "./policy-upload.ts";
import { createPrivyWallet, type PrivyWallet } from "./privy.ts";

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
    /** The one origin the page is served from. The service refuses a request from any other. */
    PAGE_ORIGIN: z.url(),
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

const client = createPublicClient({
  chain: arc(environment.ARC_RPC_URL),
  transport: http(environment.ARC_RPC_URL),
});

/** One keypair per deployment, so the public half is read once at start and never again. */
const enclavePublicKey = await client.readContract({
  address: environment.SEALED_AUCTION_ADDRESS,
  abi: sealedAuctionAbi,
  functionName: "enclavePublicKey",
});

// Asked of the node rather than taken from the environment: the chain a service signs against is
// whichever one answers on the RPC it was given.
const chainId = await client.getChainId();
const chainName = chainId === ARC_CHAIN_ID ? arc(environment.ARC_RPC_URL).name : "local chain";

const wallet = organizationWallet(environment.PRIVY_WALLET_ID);
const quorumWallet = organizationWallet(environment.PRIVY_QUORUM_WALLET_ID);

const app = createPurchaserApp({
  policyAgent: createPolicyAgent(environment.INTENT_MODEL),
  uploadPolicy: createPolicyUploader(environment.RELAY_URL),
  enclavePublicKey: hexToBytes(enclavePublicKey),
  payoutCapBucket: environment.PAYOUT_CAP_BUCKET,
  pageOrigin: environment.PAGE_ORIGIN,
  funder: createFunder({
    wallet,
    quorumWallet,
    rpcUrl: environment.ARC_RPC_URL,
    sealedAuction: environment.SEALED_AUCTION_ADDRESS,
    maxPayoutCap: environment.MAX_PAYOUT_CAP,
    quorumCeiling: environment.PRIVY_QUORUM_CEILING,
    serverKeys: environment.PRIVY_SERVER_KEYS,
    quorumKeys: environment.PRIVY_QUORUM_KEYS,
  }),
});

// The addresses, not the Privy wallet identifiers: an address is what the buyer's USDC moves from,
// and it is the one an operator can look up on a block explorer.
const [buyer, quorumBuyer] = await Promise.all([wallet.address(), quorumWallet.address()]);

/**
 * What the organization lets the buyer sign, read back from Privy rather than from this repository.
 * A rule an operator edited in the dashboard is the rule that will refuse the funding call.
 *
 * A service that starts is worth more than one that knows its own spend policy, so a Privy that
 * cannot answer costs a line and nothing else.
 */
async function spendPolicy(source: PrivyWallet): Promise<string[]> {
  try {
    const policies = await source.policies();
    if (policies.length === 0) {
      return [yellow("none attached")];
    }

    return policies.flatMap((policy) => [
      policy.name,
      ...policy.rules.map(
        (rule) => `${rule.action === "ALLOW" ? green("✓") : red("✗")} ${rule.name}`,
      ),
    ]);
  } catch (reason) {
    console.error(red(`the spend policy could not be read: ${describeError(reason)}`));
    return [yellow("unavailable")];
  }
}

const [walletPolicy, role] = await Promise.all([spendPolicy(wallet), policyAgentRole()]);

serve({ fetch: app.fetch, port: environment.PURCHASER_PORT }, (info) => {
  console.log(
    banner(`Purchaser - listening on http://localhost:${info.port}`, [
      ["wallet", cyan(buyer)],
      ["quorum wallet", cyan(quorumBuyer)],
      ["chain", `${chainName} (${chainId})  ${environment.ARC_RPC_URL}`],
      ["auction contract", cyan(environment.SEALED_AUCTION_ADDRESS)],
      ["relay", environment.RELAY_URL],
      ["Privy wallet policy", ""],
    ]),
  );
  // Indented under their row rather than beside it: a group reads as one thing that way, and the
  // rows above it stay the service itself.
  for (const line of walletPolicy) {
    console.log(`      ${line}`);
  }

  console.log(
    group("agent", [
      ["model", coral(environment.INTENT_MODEL)],
      ["tools", yellow(`[${VALIDATE_POLICY}]`)],
      ["role", `"${role}"`],
    ]),
  );
});
