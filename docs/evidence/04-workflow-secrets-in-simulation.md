# Evidence: workflow secrets in simulation

Run date: 2026-09-09. Answers `docs/scratch/verification/issues/04-workflow-secrets-in-simulation.md`
and row V4 of `docs/decisions.md`.

CRE CLI `v1.32.0`, `@chainlink/cre-sdk` 1.20.0, template `hello-confidential-workflows-ts` in a
scratch directory.

## The mechanism

`secrets.yaml` maps the id the handler asks for to the name of an environment variable. It holds no
values:

```yaml
secretsNames:
  POLICY:
    - SECRET_POLICY
  X25519_SK:
    - SECRET_X25519_SK
```

The file is named per target in `workflow.yaml`, as `workflow-artifacts.secrets-path`. The CLI reads
the values from the process environment, so the `.env` file has to be passed explicitly:

```
$ cre workflow simulate v3 --non-interactive --target staging-settings --trigger-index 0 -e .env
```

Without `-e .env` the run fails after compiling, even with the file sitting next to `project.yaml`:

```
✗ failed to replace secret names with environment variables: environment variable SECRET_API_TOKEN
  for secret value not found, please export it to your environment
```

`runtime.getSecret({ id })` then returns `{ id, value }` inside `handlerInTee`, where `value` is
text.

## The Policy and the key both fit, with room to spare

The probe asked for both, plus a filler secret of a chosen length, and logged lengths and a keccak
prefix rather than values:

```
[USER LOG] POLICY: ok chars=425 keccakPrefix=530b9302
[USER LOG] X25519_SK: ok chars=44 keccakPrefix=02891344
[USER LOG] BYTES_1024: ok chars=1024 keccakPrefix=a01671e2
[USER LOG] BYTES_10240: ok chars=10240 keccakPrefix=5188f276
[USER LOG] BYTES_102400: ok chars=102400 keccakPrefix=b302d17f
[USER LOG] BYTES_131000: ok chars=131000 keccakPrefix=f4b0b3b1
```

- The Policy from `docs/spec.md`, canonical and on one line, is 425 characters.
- A 32-byte X25519 private key in base64 is 44 characters.
- Both are three orders of magnitude under the first limit that appears. No trimming.

## The limit is the operating system, at 131,072 bytes per secret

131,000 characters passes. 131,100 does not, and the failure is a build failure, not a runtime one:

```
✗ failed to compile workflow: failed to compile workflow: fork/exec /home/agent/.bun/bin/bun:
  argument list too long
```

That is `E2BIG` from `exec`. Linux caps a single argument or environment entry at `MAX_ARG_STRLEN`,
32 pages, 131,072 bytes, and the CLI passes the resolved secrets to `bun` through the environment.
So in simulation the cap is the operating system's, not the CRE's, and it applies per secret rather
than to the total. The four secrets above coexisted in one run.

## What this does not prove

- Deployment was not tested. `cre secrets create` uploads to the Vault DON from the same YAML shape,
  and it needs deploy access, which this account does not have, per row V10. Any Vault DON size
  limit is unverified.
- Nothing here says the secret is confidential. The simulator is not a real TEE, per row V10.
