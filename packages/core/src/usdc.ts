/**
 * Every USDC amount in a Policy, a Bid or a Settlement is an integer count of minor units. Nothing
 * downstream converts anything, so this constant exists to be read, not to be applied.
 *
 * Verified on Arc testnet: the ERC-20 at `0x3600000000000000000000000000000000000000` reports 6
 * decimals. See `docs/scratch/verification/issues/05-arc-usdc-address-and-decimals.md`. Gas is
 * quoted in 18-decimal units and never enters a Policy, a Bid or a Settlement.
 */
export const USDC_DECIMALS = 6;

/** Whole USDC to minor units. For fixtures and tests, so no file writes `520000000` by hand. */
export function usdcMinorUnits(whole: number): number {
  if (!Number.isSafeInteger(whole) || whole < 0) {
    throw new Error(`usdcMinorUnits takes a whole, non-negative number of USDC, not ${whole}`);
  }

  const minorUnits = whole * 10 ** USDC_DECIMALS;

  // The input can be safe while the result is not, and an unsafe result cannot round-trip a hash.
  if (!Number.isSafeInteger(minorUnits)) {
    throw new Error(`${whole} USDC is too large to hold in minor units as a safe integer`);
  }

  return minorUnits;
}
