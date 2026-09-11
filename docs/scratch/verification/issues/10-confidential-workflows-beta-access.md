# Chainlink Confidential Workflows is in private beta. Has access been requested, and what came back?

Status: resolved Type: research

Request it on day zero regardless. The Chainlink prize accepts CLI simulation as evidence, so the
plan does not depend on approval, but the answer changes what the README can claim.

## Acceptance criteria

- [x] Row V10 records the date the request was sent and whatever came back.
- [x] It records whether `cre workflow simulate` runs the confidential template without approval,
      because that is what the plan actually rests on.

## Comments

- 2026-09-08 — request submitted, no response yet

The plan does not wait on approval. Two documentation statements say so directly: "Your CRE
organization can run Confidential Workflows using the local simulator", and "Do not wait for early
access. Simulate confidential workflows in minutes."

- 2026-09-09 — still no response. `cre whoami` reports `Deploy Access: Not enabled`.

Simulation does not wait on the beta. CRE CLI v1.32.0 scaffolded `hello-confidential-workflows-ts`
and ran it: the secret resolved inside `handlerInTee`, the enclave HTTP call carried it, and the run
returned `APPROVE (score: 733, secret reached API: true)`. The CLI's own notice scopes the beta to
deployment: "enrollment via your Chainlink account team is required to deploy".

Two flags are needed in a non-TTY shell: `--deployment-registry` at `cre init` and `--trigger-index`
at `cre workflow simulate`.

The simulator is not a real TEE and produces no attestation. Deploying to a real enclave still needs
enrollment, so the README claims simulation, not deployment.

Evidence and the full run: `docs/evidence/10-confidential-workflows-beta-access.md`.
