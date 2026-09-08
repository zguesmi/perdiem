import { test } from "node:test";
import assert from "node:assert/strict";

import * as core from "../src/index.ts";

// Every other package reaches this one through the index and nothing else, so an unexported
// function is an unusable one.

test("exports the encoder, the hash, the schema and the USDC unit", () => {
  assert.deepEqual(Object.keys(core).sort(), [
    "POLICY_VERSION",
    "USDC_DECIMALS",
    "canonicalJson",
    "policyHash",
    "policySchema",
    "usdcMinorUnits",
  ]);
});

test("the exported functions are the ones the other tests exercise", () => {
  const policy = { version: core.POLICY_VERSION };

  assert.equal(core.canonicalJson(policy), '{"version":1}');
  assert.equal(core.usdcMinorUnits(1), 10 ** core.USDC_DECIMALS);
});
