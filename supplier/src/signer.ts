import { createWalletClient, type Abi, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { BID_TYPES, bidDomain, bidMessage, type Bid } from "../../shared/bid.ts";
import { arc } from "../../shared/chain.ts";
import { arcTransport, assertMined, createArcClient } from "./chain.ts";
import { createCircleAgentSigner } from "./circle.ts";

/**
 * Everything an agent needs from its wallet, and nothing else. Three members: who it is, how it
 * signs a `Bid`, and how it writes a contract call.
 *
 * The address is one address for both halves. `commit` pulls the stake from the caller and the
 * enclave checks that the bid's signer is the address that staked, so a signer whose signature and
 * whose transactions came from two addresses would have every bid dropped in silence.
 */
export interface Signer {
  readonly address: `0x${string}`;
  /** The EIP-712 signature over `keccak256(0x1901 || domainSeparator || bidHash)`. */
  signBid(bid: Bid, verifyingContract: `0x${string}`): Promise<`0x${string}`>;
  /** Sends one contract call and resolves once it is mined. */
  write(call: {
    address: `0x${string}`;
    abi: Abi | readonly unknown[];
    functionName: string;
    args: readonly unknown[];
  }): Promise<`0x${string}`>;
}

/** Which wallet an agent signs with. The environment picks one; no caller names an implementation. */
export type Wallet =
  | { kind: "local"; privateKey: `0x${string}` }
  | { kind: "circle"; address: `0x${string}` };

export function createSigner(wallet: Wallet, rpcUrl: string): Signer {
  return wallet.kind === "circle"
    ? createCircleAgentSigner({ address: wallet.address, rpcUrl })
    : createLocalSigner({ privateKey: wallet.privateKey, rpcUrl });
}

/**
 * A viem externally owned account. It keeps the bid flow and its tests runnable without a Circle
 * session; `createCircleAgentSigner` is the demo path and sits behind this same interface.
 */
export function createLocalSigner(options: {
  privateKey: `0x${string}`;
  rpcUrl: string;
}): Signer {
  const account = privateKeyToAccount(options.privateKey);
  const chain = arc(options.rpcUrl);
  const wallet: WalletClient = createWalletClient({
    account,
    chain,
    transport: arcTransport(options.rpcUrl),
  });
  const reader = createArcClient(options.rpcUrl);

  return {
    address: account.address,

    signBid(bid, verifyingContract) {
      return account.signTypedData({
        domain: bidDomain(verifyingContract),
        types: BID_TYPES,
        primaryType: "Bid",
        message: bidMessage(bid),
      });
    },

    async write(call) {
      const hash = await wallet.writeContract({
        account,
        chain,
        address: call.address,
        abi: call.abi as Abi,
        functionName: call.functionName,
        args: [...call.args],
      });
      return assertMined(reader, hash, call.functionName);
    },
  };
}
