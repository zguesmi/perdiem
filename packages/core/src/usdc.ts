import { parseUnits } from "viem";

/**
 * How many decimal places the escrow USDC uses. The one place the number lives: the Budget, the
 * Payout, the Stake, the maximum price and every Preference Bonus are all denominated with it.
 *
 * Verified in docs/scratch/verification/issues/05-arc-usdc-address-and-decimals.md. If it turns out
 * to be something other than 6, only this line and the golden fixture change; no scoring rule
 * does, because every comparison is between two amounts in the same unit.
 */
export const USDC_DECIMALS = 6;

/** Whole USDC written as a decimal, with no exponent and no thousands separator. */
const DECIMAL_AMOUNT = /^-?\d+(?:\.\d+)?$/;

/**
 * Whole USDC to USDC minor units.
 *
 * The conversion goes through the decimal string rather than a multiplication, because
 * `0.07 * 10 ** 6` is 70000.00000000001 and a Policy carrying that number is a Policy Hash nobody
 * can reproduce. An amount with more precision than USDC has is rejected, not rounded.
 */
export function usdcMinorUnits(amount: number | string): number {
  const text = typeof amount === "number" ? String(amount) : amount.trim();
  if (!DECIMAL_AMOUNT.test(text)) {
    throw new Error(`usdcMinorUnits: ${text} is not a plain decimal amount`);
  }

  const fraction = text.split(".")[1] ?? "";
  if (fraction.length > USDC_DECIMALS) {
    throw new Error(
      `usdcMinorUnits: ${text} carries more precision than USDC's ${String(USDC_DECIMALS)} decimals`,
    );
  }

  const minorUnits = parseUnits(text, USDC_DECIMALS);
  // Policy and Bid amounts are JSON numbers, so anything past the safe integer range cannot be
  // canonically encoded and must fail here rather than silently lose its low digits.
  if (!Number.isSafeInteger(Number(minorUnits))) {
    throw new Error(`usdcMinorUnits: ${text} is past the safe integer range in minor units`);
  }

  return Number(minorUnits);
}
