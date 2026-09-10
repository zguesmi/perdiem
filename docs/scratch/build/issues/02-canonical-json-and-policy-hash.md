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
- [x] `packages/core/test/policy-hash.test.ts` asserts against the Policy in `docs/spec.md`, not the
      two-field placeholder it carries today.
- [x] The golden fixture file holds the Policy and its expected hash, and the test reads the
      expected value from the file rather than computing it.
- [x] The stub error messages point at `docs/scratch/build/issues/01-...`. Today they omit `issues/`
      and lead nowhere.

## Answer

Implemented on `feat/core-canonical-json` and `feat/core-policy-hash-fixture`. 43 tests pass in
`packages/core` and `tsc --noEmit` is clean across every package.

- `canonicalJson` is RFC 8785 restricted to integers. Keys sort at every depth by UTF-16 code unit,
  array order is preserved, and there is no insignificant whitespace. Rejected, never rounded:
  fractions, non-finite numbers, unsafe integers, `null`, `undefined`, bigint, non-plain objects
  such as `Date`, array holes, and lone surrogates. Each rejection names the field.
- Four vectors from the reference implementation are vendored at `packages/core/test/vectors` and
  reproduced byte for byte. `arrays.json` and `values.json` are left out because both carry `null`
  and fractions, which this encoder rejects by design.
- `policyHash` is `keccak256(utf8Bytes(canonicalJson(policy)))`. It takes `unknown`, so a candidate
  that has not passed `policySchema` can still be hashed and no caller is forced to validate first.
- The placeholder `Policy` type is now the schema from `docs/spec.md`, as a zod schema strict at
  every depth. An unknown key is extra canonical bytes and therefore a different hash. Two
  cross-field rules: checkout after checkin, and `nights` equal to the nights between the dates.
  `tradeDown.stars` gets no rule, because `docs/spec.md` constrains it no further.
- The golden fixture is `packages/core/src/golden-policy.json`, holding the Policy, its canonical
  bytes and the hash `0xcf8e8d0c8679bb6c91011ea5d77ef5f4e44efcce1846bec48aa1ddcc2235ea8c`. The test
  reads that value rather than computing it. `scripts/generate-fixture.ts` regenerates the file, so
  a schema change is a `version` bump and a rerun.

Verified outside this codebase, because a fixture our own encoder generated proves nothing alone:

- The canonical bytes match the python `jcs` package, an independent RFC 8785 implementation.
- The hash matches pycryptodome's keccak256 over those bytes.

Two things this ticket did not cover:

- `workflow/test/scoring.test.ts` held whole USDC and `distanceKm` against a Policy in minor units
  and metres, so the new type broke its typecheck and two of its assertions would have passed
  without exercising the rule they name. The fixtures move to minor units and metres and
  `Bid.distanceKm` becomes `distanceMeters`. `settle` stays unimplemented, which is ticket 06.
- `workflow/` reaches `packages/core` through `file:`, which pnpm hard-links rather than symlinks.
  Any write that replaces the file breaks the link, and the enclave-side test then scores against a
  stale `goldenPolicy`. Flagged, not fixed. Run `pnpm install` inside `workflow/` after changing
  `packages/core`.

## Comments

## Dev review

Not reviewed yet.
