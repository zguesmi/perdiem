# Evidence: Chainlink Confidential Workflows without beta approval

Run date: 2026-09-09. Answers `docs/scratch/verification/issues/10-confidential-workflows-beta-access.md`
and row V10 of `docs/decisions.md`.

CRE CLI `v1.32.0`. The project was scaffolded in a scratch directory, not in `workflow-cre/`, so nothing
in the repo depends on it.

## 1. The account has no deploy access

```
$ cre whoami
Email:             <redacted>
Organization ID:   <redacted>
Organization Name: <redacted>
Deploy Access:     Not enabled
```

## 2. The confidential template is listed and scaffolds without approval

`cre templates list` returns `hello-confidential-workflows-ts`, tags `confidential-compute, tee,
secrets`.

```
$ cre init --template=hello-confidential-workflows-ts --project-name=v10check \
    --workflow-name=v10 --deployment-registry=onchain:ethereum-testnet-sepolia --non-interactive
✓ Project created successfully!

  Confidential Workflows is in private beta — enrollment via your Chainlink
account team is required to deploy. Copy .env.example to .env and set
SECRET_API_TOKEN before simulating.
```

The CLI states the limit itself: enrollment is required **to deploy**, not to simulate.

Two flags are needed in a non-TTY shell: `--non-interactive` fails without `--deployment-registry`
at init and without `--trigger-index` at simulate.

## 3. The simulation runs the enclave handler

`SECRET_API_TOKEN` was set to `v10-check-token-not-a-real-secret` for this run.

```
$ cre workflow simulate v10 --non-interactive --trigger-index 0
✓ Workflow compiled
✓ Simulation limits enabled
  HTTP: req=120kb resp=250kb timeout=10s | ConfHTTP: req=125kb resp=500kb timeout=1m30s |
  Consensus obs=25kb | ChainWrite evm_report=50kb evm_gas=10000000 | WASM binary=100mb compressed=20mb
  Binary hash: 8d1d2ef12240bebb82ff7fc712e1f701bfae945d0e854063fb181cc6b54a2e3b
  Config hash: 4b35871e775e904ee1fe5fb9aa7666f7d8b5817940adee78de64c0ab0266b380

Running trigger trigger=cron-trigger@1.0.0
╭─ Trigger requested TEE Execution your trigger will run in one of the following Tees:
│     - AWS Nitro in us-west-2
│ The simulator is not a real TEE, and is meant to debug.
│ During real execution, user logs for this trigger will not be visible, and will not leave the TEE.
╰─

[USER LOG] Enclave computation complete. verdict=APPROVE

✓ Workflow Simulation Result:
"APPROVE (score: 733, secret reached API: true)"
```

`secret reached API: true` is the template asserting that `runtime.getSecret({ id: 'API_TOKEN' })`
resolved inside `handlerInTee` and that the value reached the HTTP call made from the enclave.

## What this does not prove

- The simulator is not a real TEE. The banner says so. No attestation is produced.
- Deployment to a real enclave still needs beta enrollment. Nothing here was deployed.
- The template's HTTP call goes to `https://postman-echo.com/headers`, a public host. Reaching a
  relay on localhost is a separate question: `docs/scratch/verification/issues/13`.
