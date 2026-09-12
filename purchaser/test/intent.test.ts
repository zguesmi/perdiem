import assert from "node:assert/strict";
import { test } from "node:test";

import { x25519 } from "@noble/curves/ed25519.js";

import { hashPolicy } from "../../shared/policy-hash.ts";
import { referencePolicy, makePolicy } from "../../shared/reference-policy.ts";
import { openSealedPolicy } from "../../shared/sealed-policy.ts";
import { createPurchaserApp } from "../src/app.ts";
import type { Funder, Funding } from "../src/funding.ts";
import type { IntentAgent } from "../src/intent.ts";
import type { PolicyUploader } from "../src/policy-upload.ts";
import { PolicyRefusedError } from "../src/privy.ts";

/** 250 USDC. The reference policy's 520 maximum price rounds up to a 750 cap, as the demo does. */
const payoutCapBucket = 250_000_000n;

const funded: Funding = {
  auctionId: `0x${"a1".repeat(32)}`,
  approveHash: `0x${"b2".repeat(32)}`,
  createAuctionHash: `0x${"c3".repeat(32)}`,
  quorumSigned: true,
};

/** Records what the route asked it to fund, so a test can assert on what reached it. */
function funder(
  answer: () => Promise<Funding> = async () => funded,
): Funder & { funded: () => { policyHash: `0x${string}`; payoutCap: bigint }[] } {
  const calls: { policyHash: `0x${string}`; payoutCap: bigint }[] = [];
  const fund: Funder = async (policyHash, _requirements, payoutCap) => {
    calls.push({ policyHash, payoutCap });
    return answer();
  };
  return Object.assign(fund, { funded: () => calls });
}

const intent =
  "Paris, 12 to 14 October 2026, one double room, 4 star minimum, at most 520 USDC. " +
  "Free cancellation is worth 50. Breakfast is worth 40. I would accept 3 star if at least 30% cheaper.";

const summary = "Paris, 12 to 14 October 2026, 2 nights.\n1 double room, 4 stars or better.";

/** What the model answers with, so a test states only the half it is about. */
function answer(policy: unknown = referencePolicy, text: string = summary): unknown {
  return { policy, summary: text };
}

/** Answers with each candidate in turn, and records how many calls the service actually made. */
function stub(...candidates: unknown[]): IntentAgent & { calls: () => number } {
  let calls = 0;
  const intentAgent = async (): Promise<unknown> => candidates[calls++ % candidates.length];

  return Object.assign(intentAgent, { calls: () => calls });
}

/** The service under test. Every dependency that costs money or touches a chain is a stub. */
function service(intentAgent: IntentAgent, fund: Funder = funder()) {
  return createPurchaserApp({
    intentAgent,
    funder: fund,
    uploadPolicy: async () => {},
    payoutCapBucket,
    enclavePublicKey: x25519.getPublicKey(x25519.utils.randomSecretKey()),
  });
}

async function post(
  app: ReturnType<typeof createPurchaserApp>,
  path: string,
  requestBody: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

test("turns one sentence into a policy the buyer can read", async () => {
  const intentAgent = stub(answer());
  const response = await post(service(intentAgent), "/intent", { intent });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.policy, referencePolicy);
  assert.equal(response.body.summary, summary);
  assert.equal(intentAgent.calls(), 1);
});

test("rejects an answer that carries no summary for the buyer", async () => {
  // The buyer approves what they read, so a policy with nothing to read is not an answer.
  const intentAgent = stub({ policy: referencePolicy });
  const response = await post(service(intentAgent), "/intent", { intent });

  assert.equal(response.status, 422);
});

test("retries a candidate that fails the schema exactly once", async () => {
  const intentAgent = stub(answer(makePolicy({ hardRequirements: { minStars: 9 } })), answer());
  const response = await post(service(intentAgent), "/intent", { intent });

  assert.equal(response.status, 200);
  assert.equal(intentAgent.calls(), 2);
});

test("tells the retry what was wrong with the first answer", async () => {
  // A byte-identical second call reproduces a deterministic failure and pays for it twice.
  const rejections: (string | undefined)[] = [];
  let call = 0;
  const intentAgent: IntentAgent = async (_intent, rejection) => {
    rejections.push(rejection);
    return call++ === 0 ? answer(makePolicy({ hardRequirements: { minStars: 9 } })) : answer();
  };

  await post(service(intentAgent), "/intent", { intent });

  assert.equal(rejections[0], undefined);
  assert.match(String(rejections[1]), /minStars/);
});

test("gives up after the second failure, and hashes nothing", async () => {
  const intentAgent = stub(answer(makePolicy({ currency: "EUR" })));
  const response = await post(service(intentAgent), "/intent", { intent });

  assert.equal(response.status, 422);
  assert.equal(intentAgent.calls(), 2);
  assert.equal(response.body.policy, undefined);
});

test("rejects a fractional price rather than rounding it", async () => {
  // Rounding would silently change the number the buyer is about to commit to on chain.
  const intentAgent = stub(answer(makePolicy({ maxPrice: 520_000_000.5 })));
  const response = await post(service(intentAgent), "/intent", { intent });

  assert.equal(response.status, 422);
});

test("rejects a body that is not JSON rather than failing", async () => {
  const app = service(stub(answer()));

  for (const path of ["/intent", "/confirm"]) {
    const response = await app.request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });

    assert.equal(response.status, 422, path);
  }
});

test("hashes the confirmed policy the same way every other package does", async () => {
  const fund = funder();
  const response = await post(service(stub(answer()), fund), "/confirm", {
    policy: referencePolicy,
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.policyHash, hashPolicy(referencePolicy));
  // The hash the buyer is shown is the hash that was funded. Two calls here is two auctions.
  assert.deepEqual(fund.funded(), [
    { policyHash: hashPolicy(referencePolicy), payoutCap: 750_000_000n },
  ]);
  assert.equal(response.body.auctionId, funded.auctionId);
  assert.equal(response.body.approveHash, funded.approveHash);
  assert.equal(response.body.createAuctionHash, funded.createAuctionHash);
  // The buyer publishes this half, so a field that leaks into it is a field every supplier reads.
  assert.deepEqual(response.body.publicRequirements, {
    ...referencePolicy.hardRequirements,
    tradeDownStars: referencePolicy.tradeDown.stars,
  });
});

test("refuses to hash a policy that does not match the schema", async () => {
  const response = await post(service(stub(answer())), "/confirm", {
    policy: makePolicy({ preferences: { refundable: -1 } }),
  });

  assert.equal(response.status, 422);
});

test("tells the buyer what the organization refused, rather than failing", async () => {
  // A price the spend policy will not fund is an answer. The buyer lowers it and confirms again.
  const refused = funder(() => Promise.reject(new PolicyRefusedError("RPC request denied")));
  const response = await post(service(stub(answer()), refused), "/confirm", {
    policy: makePolicy({ maxPrice: 800_000_000 }),
  });

  assert.equal(response.status, 422);
  assert.equal(response.body.error, "RPC request denied");
  assert.equal(response.body.payoutCap, "1000000000");
});

test("seals the policy to the enclave and uploads it before it opens the auction", async () => {
  // The enclave fetches by the hash the chain carries, so the upload has to be there first. Put
  // the auction on chain first and a workflow that runs on time finds nothing to score.
  const order: string[] = [];
  const enclavePrivateKey = x25519.utils.randomSecretKey();
  let uploaded: Uint8Array | undefined;

  const fund: Funder = async () => {
    order.push("createAuction");
    return funded;
  };
  const uploadPolicy: PolicyUploader = async (_policyHash, envelope) => {
    order.push("uploadPolicy");
    uploaded = envelope;
  };

  const app = createPurchaserApp({
    intentAgent: stub(answer()),
    funder: fund,
    uploadPolicy,
    payoutCapBucket,
    enclavePublicKey: x25519.getPublicKey(enclavePrivateKey),
  });
  const response = await post(app, "/confirm", { policy: referencePolicy });

  assert.equal(response.status, 200);
  assert.deepEqual(order, ["uploadPolicy", "createAuction"]);
  assert.deepEqual(
    openSealedPolicy(uploaded as Uint8Array, enclavePrivateKey, hashPolicy(referencePolicy)),
    referencePolicy,
  );
});

test("opens no auction when the sealed policy does not reach the relay", async () => {
  // An auction whose policy the enclave cannot fetch pays nobody and refunds on timeout. Better
  // to fail before the buyer's money is locked.
  const fund = funder();
  const app = createPurchaserApp({
    intentAgent: stub(answer()),
    funder: fund,
    uploadPolicy: async () => {
      throw new Error("the relay refused the sealed policy with 409");
    },
    payoutCapBucket,
    enclavePublicKey: x25519.getPublicKey(x25519.utils.randomSecretKey()),
  });

  const response = await post(app, "/confirm", { policy: referencePolicy });

  assert.equal(response.status, 502);
  assert.deepEqual(fund.funded(), []);
});
