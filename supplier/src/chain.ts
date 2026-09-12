import { createPublicClient, http, type PublicClient } from "viem";

import { arc } from "../../shared/chain.ts";

/**
 * HTTP everywhere. Nothing subscribes: the watcher reads `eth_getLogs` over a range it tracks
 * itself, so a WebSocket endpoint would buy a reconnection path and nothing else.
 *
 * A shared endpoint answers a burst with `429 rate limit exceeded`, and three agents starting at
 * once are a burst: Arc's public one refuses a fourth concurrent `eth_getLogs`. viem retries a 429
 * on its own, and the wait between attempts is what the default does not give: a second, so a
 * refused startup read waits the limiter out instead of killing the agent.
 */
export function arcTransport(rpcUrl: string) {
  return http(rpcUrl, { retryCount: 5, retryDelay: 1_000 });
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
