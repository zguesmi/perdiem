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
