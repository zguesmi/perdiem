import { defineChain } from "viem";

/**
 * The Arc testnet, confirmed by `eth_chainId` against the public RPC.
 *
 * Every TypeScript reader takes the chain id from here. It goes into the EIP-712 domain that each
 * supplier signs against, and a wrong one verifies locally and is rejected by the enclave.
 * `onchain/hardhat.config.ts` states it a second time, because a Hardhat network entry cannot
 * import from this directory.
 */
export const ARC_CHAIN_ID = 5042002;

/**
 * Arc testnet as viem wants it. Every client in the repository is built from this one definition,
 * so no reader can sign or read against a chain id the rest disagrees with.
 */
export function arc(rpcUrl: string) {
  return defineChain({
    id: ARC_CHAIN_ID,
    name: "Arc testnet",
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
}
