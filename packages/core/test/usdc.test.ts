import { test } from "node:test";
import assert from "node:assert/strict";

import { USDC_DECIMALS, usdcMinorUnits } from "../src/usdc.ts";

test("converts the demo figures to the minor units in docs/spec.md", () => {
  assert.equal(usdcMinorUnits(520), 520000000);
  assert.equal(usdcMinorUnits(750), 750000000);
  assert.equal(usdcMinorUnits(50), 50000000);
  assert.equal(usdcMinorUnits(0), 0);
});

test("shifts by the decimal count", () => {
  assert.equal(usdcMinorUnits(1), 10 ** USDC_DECIMALS);
});

test("rejects an amount that is not a whole, non-negative number of USDC", () => {
  assert.throws(() => usdcMinorUnits(0.5));
  assert.throws(() => usdcMinorUnits(-50));
  assert.throws(() => usdcMinorUnits(Number.NaN));
});

test("rejects an amount whose minor units would not be a safe integer", () => {
  assert.throws(() => usdcMinorUnits(Number.MAX_SAFE_INTEGER));
});
