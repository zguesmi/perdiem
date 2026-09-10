---
paths:
  - "**/*.sol"
---

## Layout and naming

- File structure: pragma, imports, events, errors, interfaces, libraries, contracts
- Inside each contract, library or interface, use the following order: types, state variables,
  events, errors, modifiers, constructor, external, public, internal, private. Inside each group,
  put `view` and `pure` last.
- Prefix internal and private with `_`. Write constants in `UPPER_CASE` and immutables in
  `mixedCase`. Give a constructor parameter a trailing underscore when it shadows a state variable.
- Never use one line if statement, always use `{}`.

## Storage

- Make a mapping or variable `public` and use the generated getter.
- Store only what an on-chain rule reads. Anything else is a log line.
- Do not keep a flag that a state transition already carries.

## Functions

Inline a helper that wraps one call. Keep a helper only when it holds a loop or a rule worth a name.

## Comments

- Use `/** */` for a multi-line NatSpec block and `///` for one line.
- Don't indent after `*` to align.
- Don't use `@notice` on consts and vars.
- Never name spec, ADR, ticket, evidence row or a demo in a comment. Code outlives all of them.
  Write the constraint itself.

## Tests

- Order the file: the full happy path first, then one group per function in the order the contract
  declares them. Open each group with the case that passes, then the cases that revert.
- Name a test `test_<function>_<behaviour>`.
- Add an assertion message when the number alone does not say which rule broke.

## Dependencies

- Use existing contracts from `@openzeppelin/contracts` when possible, do not hand-roll an interface
  for a standard.
- Move tokens with `safeTransfer` and `safeTransferFrom`.
