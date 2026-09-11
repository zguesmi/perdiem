import { createPublicClient, defineChain, http, webSocket, type PublicClient } from "viem";

import { ARC_CHAIN_ID } from "../../shared/chain.ts";

/**
 * Arc testnet as viem wants it. The chain id comes from `shared/`, because a wrong one signs a
 * domain the enclave rejects.
 */
export function arc(rpcUrl: string) {
  const websocket = isWebSocket(rpcUrl);

  return defineChain({
    id: ARC_CHAIN_ID,
    name: "Arc testnet",
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
    rpcUrls: {
      default: websocket ? { http: [], webSocket: [rpcUrl] } : { http: [rpcUrl] },
    },
  });
}

/**
 * A WebSocket endpoint is worth the scheme check: over it, viem watches events with
 * `eth_subscribe`. Arc's public HTTP endpoint answers `eth_newFilter` with
 * `The method "eth_newFilter" does not exist / is not available.`, so an HTTP client falls back to
 * polling `eth_getLogs` on every block.
 */
export function isWebSocket(rpcUrl: string): boolean {
  return rpcUrl.startsWith("ws://") || rpcUrl.startsWith("wss://");
}

export function arcTransport(rpcUrl: string) {
  return isWebSocket(rpcUrl) ? webSocket(rpcUrl) : http(rpcUrl);
}

export function createArcClient(rpcUrl: string): PublicClient {
  return createPublicClient({ chain: arc(rpcUrl), transport: arcTransport(rpcUrl) });
}
