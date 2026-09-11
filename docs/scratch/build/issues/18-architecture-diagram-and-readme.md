# Write the architecture diagram and finish the README

Status: ready-for-agent Type: task Blocked by: 13

A Mermaid diagram in `docs/architecture.md`, exported to PNG. The README explains what the product
is, how Privy enables it, and what is simulated rather than deployed.

The booking arrow runs from the Enclave to the supplier API, not from a supplier agent. The agents
stop at `bidDeadline`.

The Arc prize asks for a working frontend, a working backend and an architecture diagram, so this is
a requirement, not a flourish.

## Acceptance criteria

- [ ] `docs/architecture.md` holds a Mermaid diagram, exported to PNG.
- [ ] The README explains what the product is, how Privy enables it, and what is simulated rather
      than deployed.
- [ ] The README states who generates the enclave keypair and what its holder can read, per
      ticket 16.
- [ ] The README's AI attribution section names Claude Code and `claude-opus-5`.
- [ ] `docs/ai/README.md` links the intent prompt and every planning prompt, and its `## Prompts`
      section is no longer empty.

## Comments

## Dev review

Not reviewed yet.
