---
paths:
  - "**/*.sol"
---

# Solidity rules

Adds to `.claude/rules/coding.md`. The Solidity style guide sets anything not stated here.

## Layout

Contracts live in `contracts/`. Solidity tests and their scaffolding live in `test/`, as
`test/<Contract>.t.sol`. Nothing under `contracts/` is test-only.

Do not write a test harness. If a test cannot reach the state it needs, the contract is missing a
read the workflow or the page also needs. Add that read.

## Dependencies

Take `IERC20`, `SafeERC20` and `ERC20` from `@openzeppelin/contracts`. Do not hand-roll an interface
for a standard.

Move tokens with `safeTransfer` and `safeTransferFrom`. Never write a bool check around a raw
`transfer`. A token that returns nothing and a token that returns `false` both break it.

## Order and names

Declare in this order: types, state variables, events, errors, constructor, external, public,
internal, private. Inside each group, put `view` and `pure` last.

Prefix internal and private with `_`. Write constants in `UPPER_CASE` and immutables in `mixedCase`.
Give a constructor parameter a trailing underscore when it shadows a state variable.

## Storage

Make a mapping or variable `public` and use the generated getter. Do not hand-write a getter that
returns a state variable.

Store only what an on-chain rule reads. Anything else is a log line.

Do not keep a flag that a state transition already carries.

Name a money variable for the rule the contract enforces on it, not for the caller's intent.
`payoutCap` bounds a payout. `budget` implies a price, and a price is private.

## Functions

Fix a policy number as a contract constant when no caller has a real reason to choose it. A
parameter the caller cannot get wrong is a parameter that should not exist.

Inline a helper that wraps one call. Keep a helper only when it holds a loop or a rule worth a name.

## Comments

Use `/** */` for a multi-line NatSpec block and `///` for one line.

Never name a specification, an ADR, a ticket, an evidence row or a demo in a comment. Code outlives
all of them. Write the constraint itself.

## Tests

One test file per contract, with `setUp` in that file. No shared fixture contract, no inheritance
between test contracts.

Order the file: the full happy path first, then one group per function in the order the contract
declares them. Open each group with the case that passes, then the cases that revert.

Name a test `test_<function>_<behaviour>`.

Add an assertion message when the number alone does not say which rule broke.

Compute an expected hash off chain and assert against the literal. An implementation that builds
both sides agrees with itself.
