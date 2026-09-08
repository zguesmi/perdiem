# How this project uses AI

This project is built with AI assistance throughout. This file records what was used at each phase,
what came out of it, and where the artifacts live. It is updated as the work continues.

## Tools

| Tool                                      | Use                                                                                    |
| ----------------------------------------- | -------------------------------------------------------------------------------------- |
| claude.ai                                 | Idea development, research and verification, before any code existed                   |
| Claude Code (CLI)                         | Every phase after that: spec hardening, scaffolding, implementation                    |
| Model                                     | Claude Opus 5 (`claude-opus-5`)                                                        |
| `mattpocock-skills` plugin, version 1.2.3 | The `/grill-with-docs` command, which runs the `grilling` and `domain-modeling` skills |

## Phases

### Phase 1 — Idea, research and verification

Done on claude.ai, before the repository existed. The concept was brainstormed, then researched:
every claim behind it was checked against real data rather than assumed, and the decisions that came
out of it were made on that data. What the partner technologies actually do, what the market already
does, and what the idea has to be worth to be worth building.

**Output:** `docs/initial-spec.md`. That file is frozen. It is the record of what the idea looked
like at the beginning.

### Phase 2 — Spec hardening

Done in Claude Code with the `mattpocock-skills` plugin. The `/grill-with-docs` command runs two
skills in sequence: `grilling`, which interviews the developer round by round over a design tree,
and `domain-modeling`, which builds the project's vocabulary as the decisions land.

The session ran ten rounds. Claude asked 41 questions, each with a recommended answer; the developer
raised 10 challenges and instructions of their own. Both are recorded, separately, in the
transcript.

What it settled: the repository layout, the toolchain, the test strategy, the secrets layout, the
issue tracker shape, and the domain vocabulary. It also found two defects in the initial spec — the
budget leaking the maximum price on chain, and two words used for one concept across seven
components.

**Output:** `docs/grilling-session.md`.

### Phase 3 — Live spec

The renames and corrections the grilling session settled, applied to a single live document.
`docs/initial-spec.md` stays frozen beside it.

**Output:** `docs/spec.md`.

### Phase 4 — Scaffolding

Done in Claude Code. Every package was created with its own official init command where one exists —
`hardhat --init`, `pnpm create vite`, `pnpm create hono` — and `pnpm init` where none does. Each
package carries the first real test taken from the specification, and those tests are red on
purpose: they state what has to be true, and the tickets in `docs/scratch/build/` make them pass.

**Output:** the workspace, `CONTEXT.md`, `docs/adr/`, `docs/decisions.md`, and the two backlogs in
`docs/scratch/`.

### Phase 5 onwards

Pending. This file is updated as each phase completes.

## Prompts
