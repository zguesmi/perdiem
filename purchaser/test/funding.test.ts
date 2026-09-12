import assert from "node:assert/strict";
import { createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import { test } from "node:test";

import { canonicalJson } from "../../shared/canonical-json.ts";
import { signingKeys } from "../src/funding.ts";
import { authorizationSignature, createPrivyWallet, type PrivyTransaction } from "../src/privy.ts";

const serverKeys = ["server"];
const quorumKeys = ["travel-manager", "finance"];
const quorumCeiling = 500_000_000n;

test("the spend policy authorizes a payout cap at or under the ceiling", () => {
  for (const payoutCap of [1n, quorumCeiling]) {
    const chosen = signingKeys({ payoutCap, quorumCeiling, serverKeys, quorumKeys });

    assert.deepEqual(chosen.keys, serverKeys);
    assert.equal(chosen.quorumSigned, false);
  }
});

test("a payout cap over the ceiling needs both quorum members", () => {
  // The demo's 750 cap sits above the 500 ceiling, so the two approvals show every run.
  const chosen = signingKeys({
    payoutCap: quorumCeiling + 1n,
    quorumCeiling,
    serverKeys,
    quorumKeys,
  });

  assert.deepEqual(chosen.keys, quorumKeys);
  assert.equal(chosen.quorumSigned, true);
});

/** A P-256 keypair in the format Privy hands an authorization key out in. */
function authorizationKey(): { privateKey: string; publicKey: ReturnType<typeof createPublicKey> } {
  const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return {
    privateKey: `wallet-auth:${pair.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64")}`,
    publicKey: createPublicKey(pair.privateKey),
  };
}

test("an authorization signature verifies against the key that made it", () => {
  const { privateKey, publicKey } = authorizationKey();
  const request = { url: "https://api.privy.io/v1/wallets/w1/rpc", body: { a: 1 }, appId: "app" };

  const signature = authorizationSignature(privateKey, request);
  const payload = canonicalJson({
    version: 1,
    method: "POST",
    url: request.url,
    body: request.body,
    headers: { "privy-app-id": request.appId },
  });

  assert.equal(verify("sha256", Buffer.from(payload), publicKey, Buffer.from(signature, "base64")), true);
});

const transaction: PrivyTransaction = {
  to: `0x${"11".repeat(20)}`,
  data: "0xdeadbeef",
  chain_id: 5042002,
  nonce: 3,
  gas_limit: "0x5208",
  max_fee_per_gas: "0x3b9aca00",
  max_priority_fee_per_gas: "0x77359400",
  value: "0x0",
  type: 2,
};

/** Records every request, and answers each endpoint the wallet calls. */
function privyStub() {
  const requests: { url: string; headers: Headers; body: string }[] = [];

  const fetch: typeof globalThis.fetch = async (input, init) => {
    requests.push({
      url: String(input),
      headers: new Headers(init?.headers),
      body: String(init?.body ?? ""),
    });

    const answer = String(input).endsWith("/rpc")
      ? { data: { signed_transaction: "0x02f86d", encoding: "rlp" } }
      : { address: `0x${"22".repeat(20)}` };

    return new Response(JSON.stringify(answer), { status: 200 });
  };

  return { fetch, requests };
}

function wallet(fetch: typeof globalThis.fetch) {
  return createPrivyWallet({ appId: "app", appSecret: "secret", walletId: "w1", fetch });
}

test("signs with no authorization header when the spend policy is the whole authorization", async () => {
  const stub = privyStub();
  const signed = await wallet(stub.fetch).signTransaction(transaction, []);

  assert.equal(signed, "0x02f86d");
  assert.equal(stub.requests[0]?.headers.get("privy-authorization-signature"), null);
});

test("carries every quorum approval in one comma-separated header", async () => {
  const stub = privyStub();
  const keys = [authorizationKey().privateKey, authorizationKey().privateKey];

  await wallet(stub.fetch).signTransaction(transaction, keys);

  const header = stub.requests[0]?.headers.get("privy-authorization-signature");
  assert.equal(header?.split(",").length, 2);
});

test("signs the exact bytes it sends, so Privy re-canonicalizes to the same payload", async () => {
  const stub = privyStub();
  const { privateKey, publicKey } = authorizationKey();

  await wallet(stub.fetch).signTransaction(transaction, [privateKey]);

  const request = stub.requests[0];
  const payload = canonicalJson({
    version: 1,
    method: "POST",
    url: request?.url,
    body: JSON.parse(String(request?.body)) as unknown,
    headers: { "privy-app-id": "app" },
  });
  const signature = Buffer.from(String(request?.headers.get("privy-authorization-signature")), "base64");

  assert.equal(verify("sha256", Buffer.from(payload), publicKey, signature), true);
});

test("reads the wallet address once and reuses it", async () => {
  const stub = privyStub();
  const buyer = wallet(stub.fetch);

  assert.equal(await buyer.address(), `0x${"22".repeat(20)}`);
  assert.equal(await buyer.address(), `0x${"22".repeat(20)}`);
  assert.equal(stub.requests.length, 1);
});

test("turns a refused request into an error rather than an unsigned transaction", async () => {
  // A spend policy that refuses an approve to another spender answers 400 here, and a funding
  // flow that read past it would broadcast nothing and report success.
  const fetch: typeof globalThis.fetch = async () =>
    new Response('{"error":"RPC request denied due to policy violation"}', { status: 400 });

  await assert.rejects(() => wallet(fetch).signTransaction(transaction, []), /policy violation/);
});
