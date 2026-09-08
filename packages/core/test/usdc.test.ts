import { test } from "node:test";
import assert from "node:assert/strict";

import { USDC_DECIMALS, usdcMinorUnits } from "../src/usdc.ts";

// Every amount in a Policy, a Bid and the contract is in USDC minor units. The decimal count is
// one constant, because docs/scratch/verification/issues/05-arc-usdc-address-and-decimals.md may
// still change it, and a second copy of the number is a second thing to change.

test("scales by the decimal constant, not by a literal", () => {
  assert.equal(usdcMinorUnits(1), 10 ** USDC_DECIMALS);
});

test("converts the demo figures", () => {
  assert.equal(usdcMinorUnits(750), 750_000_000);
  assert.equal(usdcMinorUnits(520), 520_000_000);
  assert.equal(usdcMinorUnits(440), 440_000_000);
  assert.equal(usdcMinorUnits(50), 50_000_000);
});

// Through the decimal string, so 0.07 never becomes 70000.00000000001.
test("converts a fractional amount exactly", () => {
  assert.equal(usdcMinorUnits(1.5), 1_500_000);
  assert.equal(usdcMinorUnits("0.07"), 70_000);
  assert.equal(usdcMinorUnits("-0.000001"), -1);
});

test("rejects more precision than USDC has", () => {
  assert.throws(() => usdcMinorUnits("0.0000001"), /precision/i);
});

test("rejects an amount past the safe integer range", () => {
  assert.throws(() => usdcMinorUnits(10_000_000_000), /safe integer/i);
});

test("rejects anything that is not a plain decimal", () => {
  assert.throws(() => usdcMinorUnits("1e6"), /decimal/i);
  assert.throws(() => usdcMinorUnits("abc"), /decimal/i);
  assert.throws(() => usdcMinorUnits(Number.NaN), /decimal/i);
});
