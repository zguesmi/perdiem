import { createPrivateKey, sign } from "node:crypto";
import { z } from "zod";

import { canonicalJson } from "../../shared/canonical-json.ts";

const PRIVY_API = "https://api.privy.io/v1";

/**
 * One transaction as the Privy REST API takes it. Snake case and hex are the wire format, not a
 * preference: the spend policy reads these field names out of the request.
 *
 * `chain_id` and `nonce` are numbers because both are small enough to be exact ones. Everything
 * that can exceed `Number.MAX_SAFE_INTEGER` is hex, so no amount is rounded on the way out.
 */
export interface PrivyTransaction {
  readonly to: `0x${string}`;
  readonly data: `0x${string}`;
  readonly chain_id: number;
  readonly nonce: number;
  readonly gas_limit: `0x${string}`;
  readonly max_fee_per_gas: `0x${string}`;
  readonly max_priority_fee_per_gas: `0x${string}`;
  readonly value: "0x0";
  readonly type: 2;
}

/**
 * The buyer's organization wallet, reduced to what funding needs: who it is, and one signature.
 *
 * Privy signs and does not broadcast on Arc — `eth_sendTransaction` answers
 * `App is not authorized to transact on chain eip155:5042002` — so this returns the signed RLP and
 * the caller sends it to the Arc RPC itself.
 */
export interface PrivyWallet {
  address(): Promise<`0x${string}`>;
  /**
   * @param authorizationKeys The keys that must sign the request itself. Empty when the wallet's
   * spend policy is the whole authorization; two when the key quorum has to approve.
   */
  signTransaction(
    transaction: PrivyTransaction,
    authorizationKeys: readonly string[],
  ): Promise<`0x${string}`>;
}

/**
 * The spend policy turned the request down. It is the organization refusing to sign, not a fault,
 * so the buyer is told what happened rather than shown a failure.
 */
export class PolicyRefusedError extends Error {}

const refusal = z.object({ error: z.string(), code: z.literal("policy_violation") });

const walletAnswer = z.object({ address: z.custom<`0x${string}`>((value) => typeof value === "string") });

const signedAnswer = z.object({
  data: z.object({ signed_transaction: z.custom<`0x${string}`>((value) => typeof value === "string") }),
});

/**
 * The request signature a key quorum member produces. RFC 8785 canonical JSON over the request,
 * then ECDSA P-256 with SHA-256, base64. The canonical encoder is the one every other hash in this
 * repository goes through, so the bytes signed here are built the same way as the policy hash.
 */
export function authorizationSignature(
  authorizationKey: string,
  request: { url: string; body: unknown; appId: string },
): string {
  const payload = canonicalJson({
    version: 1,
    method: "POST",
    url: request.url,
    body: request.body,
    headers: { "privy-app-id": request.appId },
  });

  // Privy hands the key out with a scheme prefix. Trimming it here keeps the operator from having
  // to edit a secret before pasting it.
  const der = Buffer.from(authorizationKey.replace(/^wallet-auth:/, ""), "base64");
  const key = createPrivateKey({ key: der, format: "der", type: "pkcs8" });

  return sign("sha256", Buffer.from(payload, "utf8"), key).toString("base64");
}

export interface PrivyOptions {
  appId: string;
  appSecret: string;
  walletId: string;
  /** Injected by the tests, which have no Privy app. */
  fetch?: typeof globalThis.fetch;
}

export function createPrivyWallet(options: PrivyOptions): PrivyWallet {
  const send = options.fetch ?? globalThis.fetch;
  const authorization = `Basic ${Buffer.from(`${options.appId}:${options.appSecret}`).toString("base64")}`;
  let address: Promise<`0x${string}`> | undefined;

  async function call(url: string, body?: unknown, authorizationKeys: readonly string[] = []) {
    // The signature covers the exact bytes sent, so the body is serialized once and reused.
    const signatures = authorizationKeys.map((key) =>
      authorizationSignature(key, { url, body, appId: options.appId }),
    );

    const response = await send(url, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        authorization,
        "privy-app-id": options.appId,
        "content-type": "application/json",
        // Comma-separated: one header carries every quorum member's approval.
        ...(signatures.length > 0 ? { "privy-authorization-signature": signatures.join(",") } : {}),
      },
      body: body === undefined ? undefined : canonicalJson(body),
    });

    if (!response.ok) {
      const body = await response.text();
      const refused = refusal.safeParse(JSON.parse(body) as unknown);
      if (refused.success) {
        throw new PolicyRefusedError(refused.data.error);
      }
      throw new Error(`Privy answered ${response.status}: ${body}`);
    }
    return (await response.json()) as unknown;
  }

  return {
    address() {
      // Cleared on rejection: a cached failure would outlive the blip that caused it and refuse
      // every later funding attempt until the process restarts.
      address ??= call(`${PRIVY_API}/wallets/${options.walletId}`)
        .then((answer) => walletAnswer.parse(answer).address)
        .catch((reason: unknown) => {
          address = undefined;
          throw reason;
        });
      return address;
    },

    async signTransaction(transaction, authorizationKeys) {
      const answer = await call(
        `${PRIVY_API}/wallets/${options.walletId}/rpc`,
        { method: "eth_signTransaction", params: { transaction } },
        authorizationKeys,
      );
      return signedAnswer.parse(answer).data.signed_transaction;
    },
  };
}
