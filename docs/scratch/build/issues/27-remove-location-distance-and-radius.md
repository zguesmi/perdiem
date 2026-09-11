# Remove location, radius and distance

Status: resolved Type: task Blocked by: none (can start immediately)

Drop `location` and `radiusMeters` from the Policy, and `distanceMeters` from the Bid. This is a
code ticket: `docs/spec.md` and `CONTEXT.md` are already updated.

`radiusMeters` was the only reader of `distanceMeters`. The eligibility rule
`distanceMeters <= radiusMeters` goes with them, so the Bid keeps a field nothing scores unless the
field goes too. It goes.

Removing `distanceMeters` changes the EIP-712 `Bid` type, so it changes `BID_TYPEHASH`, every
`bidHash`, every commitment and every fixture. Do it in one commit with the Policy change. Two
breaking changes cost twice as much as one.

The Policy `version` stays `1`. `docs/spec.md` says a changed field name needs a new `version`, and
this is a deliberate exception: nothing is deployed, so no Policy Hash from version 1 exists
anywhere to disagree with.

## Scope

| File                                  | Change                                                  |
| ------------------------------------- | ------------------------------------------------------- |
| `shared/policy.ts`                    | Drop `location` and `radiusMeters` from the schema      |
| `shared/reference-policy.ts`          | Drop both fields from the fixture                       |
| `shared/policy-hash.test.ts`          | New expected Policy Hash                                |
| `shared/bid.ts`                       | Drop `distanceMeters` from `bidSchema` and `BID_TYPES`  |
| `shared/reference-bid.ts`             | Drop the field, new expected hash                       |
| `workflow/src/scoring.ts`             | Drop the distance check from eligibility                |
| `workflow/test/scoring.test.ts`       | Drop the distance column from the demo table            |
| `onchain/contracts/SealedAuction.sol` | Drop both from `PublicRequirements`, new `BID_TYPEHASH` |
| `onchain/test/SealedAuction.t.sol`    | Follow the struct and the typehash                      |
| `agents/src/lite-api/client.ts`       | Drop `distanceKm` from `Hotel`                          |

Leave tickets 01, 02 and 03 alone. They are resolved and record what was built at the time.

## Acceptance criteria

- [x] `location` and `radiusMeters` appear nowhere in `shared/`, `workflow/`, `onchain/` or
      `agents/`.
- [x] `distanceMeters` appears nowhere in those four directories, and the EIP-712 `Bid` type has ten
      fields.
- [ ] `BID_TYPEHASH` in the contract equals the hash of the new type string. One test states it.
- [x] The Policy `version` is still `1`.
- [x] Eligibility is city, checkin, checkout, roomType, numberOfRooms, price and stars. No distance.
- [ ] The demo table still gives A ineligible, B 120 and C 170.
- [ ] `pnpm test` and `pnpm typecheck` pass from the repository root.

## Comments

- `BID_TYPEHASH` does not exist: the contract never verifies an EIP-712 bid signature, so it holds
  no typehash constant. Nothing to update, and no test to write, until a ticket puts the check on
  chain.
- The demo table is red for an unrelated reason: `settle` is still a stub, so
  `workflow/test/scoring.test.ts` fails as it did before this change. The distance column and the
  radius case are gone from the test.
- `pnpm test` fails from the repository root on the same stubs it failed on before this change:
  `priceFromRatePlan` in `agents/` and `settle` in `workflow/`. No new failure. `pnpm typecheck`
  passes.
- `distanceKm` also left `agents/src/rate-plan.ts`, which the scope table missed. It is the same
  dead dimension and nothing reads it.

## Dev review

Not reviewed yet.
