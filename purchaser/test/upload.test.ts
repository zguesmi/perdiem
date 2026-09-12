import assert from "node:assert/strict";
import { test } from "node:test";

import { createPolicyUploader } from "../src/policy-upload.ts";

const policyHash = `0x${"ab".repeat(32)}` as const;
const envelope = new Uint8Array([1, 2, 3]);

/** Answers every request with one status, and records what it was asked for. */
function relay(status: number) {
  const calls: string[] = [];
  const upload = createPolicyUploader("http://relay.test");
  const original = globalThis.fetch;

  globalThis.fetch = (async (url: string) => {
    calls.push(url);
    return new Response(null, { status });
  }) as typeof fetch;

  return { upload, calls, restore: () => (globalThis.fetch = original) };
}

test("uploads the sealed policy under its hash", async () => {
  const { upload, calls, restore } = relay(201);

  await upload(policyHash, envelope);
  restore();

  assert.deepEqual(calls, [`http://relay.test/policies/${policyHash}`]);
});

test("takes a hash the relay already holds as uploaded", async () => {
  // A confirm retried after the funding failed re-derives the same hash, and the relay is
  // first-write-wins. Refusing here would lock the buyer out of their own policy.
  const { upload, restore } = relay(409);

  await assert.doesNotReject(upload(policyHash, envelope));
  restore();
});

test("fails when the relay cannot store the sealed policy", async () => {
  const { upload, restore } = relay(503);

  await assert.rejects(upload(policyHash, envelope), /503/);
  restore();
});
