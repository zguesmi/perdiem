# Grilling session — turning the initial spec into a working project

Date: 2026-09-08.

Method: `/grill-with-docs`, worked as a design tree in rounds.
Each entry is the question and the decision it produced.

---

## Round 1 — Foundations

**Q1 — What does "ready to use" mean: documentation only, documentation plus skeleton, or a walking skeleton?**
Documentation plus skeleton. Workspace config, one package per component, one failing test per package, continuous integration. No implementation.

**Q2 — Which package manager and workspace layout?**
pnpm workspaces. `workflow/` excluded, because the CRE CLI owns its own `package.json`.

**Q3 — One shared package, duplication, or copied files?**
One shared package, `packages/core`.

**Q4 — Foundry or Hardhat?**
Hardhat 3.

**Q5 — Is the canonical term "bid" or "offer"?**
Bid. The contract already used `bidDeadline` and `bidsRoot`, so the schema changes instead.

**Q6 — Do verification answers go in a decisions file or in architecture decision records?**
Split by kind. `docs/decisions.md` holds verified facts; `docs/adr/` holds genuine trade-offs.

## Round 2 — Toolchain detail and vocabulary

**Q7 — Does the scoring function live in the shared package?**
No. Scoring stays in `workflow/`, so no supplier process can import it.

**Q8 — "Bid" names three things: the plaintext, the on-chain hash, and the ciphertext. What are they called?**
`Bid`, `BidCommitment`, `SealedBid`.

**Q9 — Which Hardhat 3 test stack?**
`hardhat-toolbox-viem` with the node test runner, plus Solidity tests for the state machine and access control.

**Q10 — What shape is continuous integration?**
Two jobs: contracts, and TypeScript with typecheck and lint.

**Q11 — How is the issue backlog grouped?**
Two features: `.scratch/verification/` and `.scratch/build/`, linked by `Blocked by:` lines.

**Q12 — `settleDeadline` gates the refund, not the settlement. Rename it?**
Yes, but not to anything containing "report".

## Round 3 — Init commands and external dependencies

**Q13 — Rename it to what?**
`finalizeDeadline`. Also remove "report" from the prose.

**Q14 — Where does the Hardhat project sit, given the template hardcodes `contracts/` for sources?**
Rename the component directory to `chain/`, so the generated layout is untouched.

**Q15 — What do the packages without an init command get?**
`pnpm init` plus a shared `@sealedesk/tsconfig` package. Keep the agent documentation the Hardhat template generates, then trim it.

**Q16 — Which external dependencies get fakes?**
All three: LiteAPI, Privy, and the enclave handler runner.

**Q17 — How are secrets laid out across six processes?**
Root file for shared values; per package for scoped secrets. The enclave private key and the relay read token never reach the agents.

## Round 4 — Naming scope and process rules

**Q18 — How far does "remove the word report" go?**
Rename ours. `onReport` and `writeReport` keep their names, because they are Chainlink's.

**Q19 — Does the CRE fake produce evidence?**
No. Fakes may run the handler; fakes may never generate evidence. `cre workflow simulate` produces `docs/evidence/`.

**Q20 — Which HTTP framework for the two services?**
Hono.

**Q21 — Is `.scratch/` committed?**
Yes, and it never holds a key or a token.

**Q22 — What shape is the first test in each package?**
The first real red test taken from the spec.

**Q23 — What is trimmed from the generated agent documentation?**
Nothing removed. Two lines added: a pointer to the root glossary, and a note that `packages/core` owns canonical JSON and hashing.

## Round 5 — Layout, records and glossary

**Q24 — Are package names scoped?**
Yes, `@sealedesk/*`.

**Q25 — What format is the decisions file?**
A facts table plus an evidence appendix.

**Q26 — Glossary conflicts: buyer versus desk, "credit" that is never paid, and a rank-neutral term in the score formula?**
Escrow is the smart contract, not the money. "Desk" is rejected as a component name. The "Rules" group is rejected. The score formula keeps the maximum price term for readability.

**Q27 — Which architecture decision records are written now?**
Two: `0001-no-reveal-phase` and `0002-scoring-is-not-shared`.

**Q28 — Where does the rule "the real CRE runs at the end" live?**
A backlog ticket, blocked by the beta access verification ticket.

## Round 6 — Monorepo shape and a spec defect

**Q29 — Flat layout, everything under `packages/`, or `apps/` plus `packages/`?**
Flat. `chain/` is neither an app nor a library, so a two-bucket convention would need three buckets. Add `workflow/` to the workspace later if the CRE CLI tolerates it.

**Q30 — What are the buyer's locked funds and the winner's payment called?**
Budget and Payout.

**Q31 — The budget is pulled by a public `transferFrom`, so it leaks the maximum price. What now?**
Pad the budget above the maximum price: budget 750, maximum price 520, payout 440, refund 310. Recorded as a workaround to improve later.

**Q32 — What replaces "Desk"?**
A synonym for procurement. Settled in Q38.

**Q33 — What was wrong with the "Rules" group?**
Both the label and the terms. It becomes **Scoring Rules**, and "feasible" becomes **Eligible**.

## Round 7 — Final naming and wiring

**Q34 — Which procurement synonym?**
Describe what the service does first. Settled in Q38.

**Q35 — What replace "Fallback Tier" and "Preference Credit"?**
**Trade-Down** and **Preference Bonus**.

**Q36 — Is the contract still `SealedAuction.sol`?**
Yes. Escrow is the custody role it plays, not a separate contract.

**Q37 — How does `workflow/` reach the shared package from outside the workspace?**
A `file:../packages/core` dependency, guarded by a fixture hash test that fails loudly if the CRE CLI drops it.

## Round 8 — Service name and preference shape

**Q38 — Given that the service parses the intent, hashes the policy, drives the Privy quorum and funds the auction, what is it called?**
`requisition/`. Plus a note: find a way to generate the enclave key so that nobody but the enclave can decrypt a bid.

**Q39 — What shape are the preferences?**
`preferences: [{ attribute, bonus }]`.

## Round 9 — Final sweep

**Q40 — How far does the abbreviation sweep go?**
Spell out words, keep unit symbols, and keep `min` and `max`. So `attr` becomes `attribute`; `maxPrice`, `minStars`, `radiusKm` and `distanceKm` stay.

**Q41 — Where do the renames land?**
`docs/initial-specs.md` is frozen in place. `docs/spec.md` becomes the live source, and `CLAUDE.md` points there.

**Q42 — Would `shared/core` be better than `packages/core`?**
No. `packages/*` is the glob every JavaScript monorepo tool expects; `shared/` is a category name, and category directories attract junk.

**Q43 — Should the repository use `CONTEXT-MAP.md`?**
No. A map is for several bounded contexts. This project has one vocabulary shared by every package.

**Q44 — "Artefacts" or "artifacts"?**
Artifacts. Hardhat generates an `artifacts/` directory, so the other spelling reads as a different concept.

**Q45 — Is the supplier's locked USDC a bond or a stake?**
Stake. `BOND` becomes `STAKE`; `bondReleased` and `bondSlashed` become `stakeReleased` and `stakeSlashed`.

**Q46 — Does the bonus carry a unit field?**
No. The bonus is a plain number and the attribute implies the unit: a `refundable` bonus is a percentage of the bid price, a `breakfast` bonus is an amount per night. The glossary must state the mapping.

---

## Final record

### Structure

| Decision | Settled |
| --- | --- |
| Scope | Documentation plus skeleton. Real red tests, no implementation |
| Layout | Flat: `chain/`, `workflow/`, `agents/`, `requisition/`, `relay/`, `web/`, plus `packages/core` and `packages/tsconfig` |
| Package manager | pnpm 12.3.4 |
| Workspace | Everything except `workflow/`; add it later if the CRE CLI tolerates it |
| Package names | Scoped, `@sealedesk/*` |
| Contracts | Hardhat 3.16.0, template `node-test-runner-viem`, solc 0.8.34, forge-std 1.16.2 |
| Contract tests | Solidity for the state machine and access control; TypeScript with viem for EIP-712 and the bids root |
| Init commands | `hardhat --init`, `pnpm create vite`, `cre init`, `pnpm create hono` twice; `pnpm init` for the libraries |
| Generated agent docs | Keep, with two added lines |
| Shared code | `packages/core` holds types, Zod schemas, canonical JSON, the policy hash, EIP-712 and the commitment. Scoring stays in `workflow/` |
| Workflow dependency | `file:../packages/core`, guarded by a fixture hash test |
| Continuous integration | Two jobs: contracts, and TypeScript with typecheck and lint |
| First tests | Real red tests taken from the spec, one per package |
| Mocks | Fakes for LiteAPI, Privy and the enclave handler runner. Fakes may run the handler; fakes may never generate evidence |
| Secrets | Root file for shared values, per package for scoped secrets; `chain/` uses `configVariable()` |
| Tracker | `.scratch/verification/` and `.scratch/build/`, committed, public, never holding a secret |
| Records | `docs/decisions.md` is a facts table plus an evidence appendix; `docs/adr/` holds trade-offs only |
| Records written now | `0001-no-reveal-phase`, `0002-scoring-is-not-shared` |
| Spec | `docs/initial-specs.md` frozen in place; `docs/spec.md` becomes the live source |

### Vocabulary

| Group | Terms |
| --- | --- |
| Actors | Buyer, Supplier, Enclave |
| Artifacts | Intent, Policy, Policy Hash, Public Requirements, Bid, Bid Commitment, Sealed Bid, Bids Root, Settlement, Receipt |
| Money | Budget, Payout, Stake. Escrow is the custody role of the `SealedAuction` contract |
| Scoring Rules | Eligible, Trade-Down, Preference Bonus |
| Services | Requisition, Relay, Workflow |

Terms removed: Offer, Desk, Feasible, Fallback Tier, Credit, Bond, soft requirements, `settleDeadline`,
`escrowAmount`, `amount`, `attr`.

### Spec changes to apply

- `settleDeadline` becomes `finalizeDeadline`. Prose says settlement, not report. `onReport` and
  `writeReport` keep their names, because they are Chainlink's.
- `Offer` becomes `Bid`, the sealed envelope becomes `SealedBid`, the on-chain hash becomes `BidCommitment`.
- `escrowAmount` becomes `budget`; the settlement's `amount` becomes `payout`.
- `BOND` becomes `STAKE`; `bondReleased` and `bondSlashed` become `stakeReleased` and `stakeSlashed`.
- `softRequirements` becomes `preferences`, shaped `[{ attribute, bonus }]` with the unit implied by
  the attribute.
- `fallback` becomes `tradeDown`.
- The budget is padded above the maximum price. Demo numbers: budget 750, maximum price 520, payout
  440, refund 310.
- The score formula keeps the maximum price term for readability, and the glossary records that it is
  rank neutral.
- Component directory `contracts/` becomes `chain/`; `desk/` becomes `requisition/`.
- `attr` becomes `attribute`. `min` and `max` prefixes stay. Unit symbols such as `Km` stay.

### Recorded as later work

1. **Enclave key generation.** Today the requisition service generates the X25519 keypair, so the
   buyer can decrypt every sealed bid. A scheme is needed where only the enclave ever holds the
   private half.
2. **Budget padding is a workaround.** The ceiling is still bounded from above on chain.
3. **Add `workflow/` to the workspace** once the CRE CLI's behaviour is known.
4. **Swap the fake handler runner for the real CRE** and capture the simulation log as evidence.
