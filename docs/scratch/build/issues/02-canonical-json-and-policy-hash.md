# Implement canonical JSON and the policy hash in the core package

Status: resolved Type: task Blocked by: 01

`packages/core` has the red tests already. Make them pass, and add the fixture the enclave asserts
against, so the buyer and the enclave cannot drift apart.

Both sides hashing the same Policy to different bytes means the settlement is rejected on chain and
the auction dies in `timeoutRefund`. That is the failure this ticket exists to prevent.

## Acceptance criteria

- [x] `canonicalJson` implements RFC 8785 restricted to integers. A fractional number is rejected,
      never rounded.
- [x] Key order and insignificant whitespace in the input cannot change the output bytes.
- [x] The USDC decimal count is an exported constant. Spelling out 6 is allowed.
- [x] `packages/core/test/policy-hash.test.ts` asserts against the Policy in `docs/spec.md`, not the
      two-field placeholder it carries today.
- [x] The golden fixture file holds the Policy and its expected hash, and the test reads the
      expected value from the file rather than computing it.
- [x] The stub error messages point at `docs/scratch/build/issues/01-...`. Today they omit `issues/`
      and lead nowhere.

## Answer

Implemented on `feat/canonical-json-policy-hash`, pull request #3.

- `canonicalJson` is RFC 8785 restricted to integers. Keys sort at every depth by UTF-16 code unit,
  array order is preserved, and there is no insignificant whitespace. Everything that two conformant
  encoders could encode differently is rejected rather than rounded: fractions, non-finite numbers,
  unsafe integers, `undefined`, `null`, functions, symbols, bigint, non-plain objects such as `Date`
  and `Map`, and cycles. Each rejection names the offending field by JSON Pointer.
- `policyHash` is `keccak256(utf8Bytes(canonicalJson(policy)))`.
- The placeholder `Policy` type is now the schema from `docs/spec.md`, written as a zod schema that
  is strict at every depth, because an unknown key is extra canonical bytes and therefore a
  different hash. One cross-field rule is enforced: checkout after checkin. `tradeDown.stars` is a
  star rating and nothing more, because `docs/spec.md` constrains it no further.
- `USDC_DECIMALS` in `packages/core/src/usdc.ts` carries the decimal count, and `usdcMinorUnits`
  converts through the decimal string rather than a multiplication, because `0.07 * 10 ** 6` is
  `70000.00000000001`. Spelling out 6 elsewhere is allowed.
- The golden fixture is `packages/core/test/fixtures/policy-hash.json`. It carries the Policy, its
  canonical bytes and the expected hash
  `0xcf8e8d0c8679bb6c91011ea5d77ef5f4e44efcce1846bec48aa1ddcc2235ea8c`. The test reads that value
  instead of recomputing it, and separately asserts the fixture Policy still equals the Policy in
  `docs/spec.md`, so a schema change fails loudly.
- Both stubs carrying the broken `docs/scratch/build/01-...` path are gone, along with the same
  stale path in the package README.

51 tests pass in `packages/core` and `tsc --noEmit` is clean.

Two things this ticket did not cover:

- `requisition/test/intent.test.ts` hashed the two-field placeholder, which the real schema rejects,
  so the branch carries one commit updating it to the Policy from `docs/spec.md`. Without it the
  merge breaks `requisition` typecheck.
- There is no fixture regeneration script. Ticket 19 owns one script for all four hashes.

## Comments
