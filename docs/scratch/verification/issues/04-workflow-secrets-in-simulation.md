# How are workflow secrets supplied in simulation, and what is the size limit?

Status: resolved Type: research Blocked by: 01-cre-simulate-writes-to-arc.md

The Policy and the enclave private key both have to fit. If the limit is tight, the Policy may need
trimming before it is uploaded, which changes what the enclave can score on.

## Acceptance criteria

- [x] Row V4 is answered with the mechanism and the size limit as a number.
- [x] The Policy and a 32-byte X25519 private key are confirmed to fit, or the trimming is
      specified.

## Comments

## Answer

`secrets.yaml` maps a secret id to the name of an environment variable and holds no values.
`workflow.yaml` names the file per target as `workflow-artifacts.secrets-path`. The CLI reads the
values from the process environment, so `-e .env` is required: without it the run fails after
compiling with `failed to replace secret names with environment variables`.

The limit is 131,072 bytes per secret, and it belongs to the operating system rather than to CRE.
131,000 characters resolve; 131,100 fail the build with `fork/exec .../bun: argument list too long`,
which is `E2BIG`. Linux caps one environment entry at `MAX_ARG_STRLEN`, 32 pages. The cap is per
secret, not per run: four secrets resolved together in one run.

Both values fit with three orders of magnitude to spare. The canonical Policy on one line is 425
characters and a 32-byte X25519 private key in base64 is 44. No trimming.

The Vault DON path is unverified. `cre secrets create` takes the same YAML but needs deploy access,
which row V10 says this account does not have.

Evidence: `docs/scratch/verification/evidence/04-workflow-secrets-in-simulation.md`.
