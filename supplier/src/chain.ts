import { createPublicClient, defineChain, http, type PublicClient } from "viem";

import { ARC_CHAIN_ID } from "../../shared/chain.ts";

/**
 * Arc testnet as viem wants it. The chain id comes from `shared/`, because a wrong one signs a
 * domain the enclave rejects.
 */
export function arc(rpcUrl: string) {
  return defineChain({
    id: ARC_CHAIN_ID,
    name: "Arc testnet",
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
}

/**
 * HTTP everywhere. Nothing subscribes: the watcher reads `eth_getLogs` over a range it tracks
 * itself, so a WebSocket endpoint would buy a reconnection path and nothing else.
 */
export function arcTransport(rpcUrl: string) {
  return http(rpcUrl);
}

export function createArcClient(rpcUrl: string): PublicClient {
  return createPublicClient({ chain: arc(rpcUrl), transport: arcTransport(rpcUrl) });
}

/**
 * Waits for one call to be mined and throws when it reverted. Neither viem nor the Circle CLI
 * treats a revert as a failure, and unchecked a reverted `commit` reads as a success: the sealed
 * bid then goes to the relay with no commitment behind it and the enclave drops it in silence.
 */
export async function assertMined(
  client: PublicClient,
  hash: `0x${string}`,
  functionName: string,
): Promise<`0x${string}`> {
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`${functionName} reverted on chain`);
  }
  return hash;
}
