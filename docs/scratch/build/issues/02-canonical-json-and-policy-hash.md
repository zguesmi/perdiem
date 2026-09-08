# Implement canonical JSON and the policy hash in the core package

Status: ready-for-agent Type: task Blocked by: 01

`packages/core` has the red tests already. Make them pass, and add the fixture the enclave asserts
against, so the buyer and the enclave cannot drift apart.

Both sides hashing the same Policy to different bytes means the settlement is rejected on chain and
the auction dies in `timeoutRefund`. That is the failure this ticket exists to prevent.

## Acceptance criteria

- [ ] `canonicalJson` implements RFC 8785 restricted to integers. A fractional number is rejected,
      never rounded.
- [ ] Key order and insignificant whitespace in the input cannot change the output bytes.
- [ ] The USDC decimal count is one exported constant. No file hardcodes 6.
- [ ] `packages/core/test/policy-hash.test.ts` asserts against the Policy in `docs/spec.md`, not the
      two-field placeholder it carries today.
- [ ] The golden fixture file holds the Policy and its expected hash, and the test reads the
      expected value from the file rather than computing it.
- [ ] The stub error messages point at `docs/scratch/build/issues/01-...`. Today they omit `issues/`
      and lead nowhere.

## Comments
