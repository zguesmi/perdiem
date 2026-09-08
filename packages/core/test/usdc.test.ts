import { test } from "node:test";
import assert from "node:assert/strict";

import { USDC_DECIMALS, usdcMinorUnits } from "../src/usdc.ts";

// Every amount in a Policy, a Bid and the contract is in USDC minor units. The decimal count is
// one constant, because docs/scratch/verification/issues/05-arc-usdc-address-and-decimals.md has
// not answered yet, and a second copy of the number is a second thing to change.

test("scales by the decimal constant, not by a literal", () => {
  assert.equal(usdcMinorUnits(1), 10 ** USDC_DECIMALS);
});

// The Budget, the maximum price, the Payout and the Stake, scaled by the constant rather than by
// a literal, so a different decimal count changes the constant and the fixture and nothing else.
test("converts the demo figures", () => {
  for (const whole of [750, 520, 440, 50]) {
    assert.equal(usdcMinorUnits(whole), whole * 10 ** USDC_DECIMALS, String(whole));
  }
});

// Through the decimal string, so 0.07 never becomes 70000.00000000001. Stated as a relation
// between two conversions, because the exact minor-unit figure depends on the decimal count.
test("converts a fractional amount exactly", () => {
  assert.equal(usdcMinorUnits(1.5) * 2, usdcMinorUnits(3));
  assert.equal(usdcMinorUnits("0.07") * 100, usdcMinorUnits(7));
});

test("converts the smallest unit USDC has", () => {
  assert.equal(usdcMinorUnits(`-0.${"0".repeat(USDC_DECIMALS - 1)}1`), -1);
});

test("rejects more precision than USDC has", () => {
  assert.throws(() => usdcMinorUnits(`0.${"0".repeat(USDC_DECIMALS)}1`), /precision/i);
});

test("rejects an amount past the safe integer range", () => {
  assert.throws(() => usdcMinorUnits(10_000_000_000), /safe integer/i);
});

test("rejects anything that is not a plain decimal", () => {
  assert.throws(() => usdcMinorUnits("1e6"), /decimal/i);
  assert.throws(() => usdcMinorUnits("abc"), /decimal/i);
  assert.throws(() => usdcMinorUnits(Number.NaN), /decimal/i);
});
