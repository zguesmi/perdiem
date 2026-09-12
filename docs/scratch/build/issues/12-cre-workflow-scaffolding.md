# Generate the CRE workflow with the official template

Status: ready-for-human Type: task Blocked by:
../verification/issues/10-confidential-workflows-beta-access.md,
../verification/issues/02-enclave-chain-read-and-confidential-http.md

`cre init --template=hello-confidential-workflows-ts`. The CLI owns the generated package.json,
which is why `workflow-cre/` is outside the pnpm workspace.

After generating, check the generated `tsconfig.json`. It must set `allowImportingTsExtensions`, or
the typecheck the CLI runs before compiling rejects every `.ts` import path in `shared/`. There is
no dependency entry to check any more: `workflow-cre/` reaches `shared/` by relative import.

Verified against CLI 1.32.0 on a scratch `hello-world-ts` project: a relative import that leaves the
CRE project root compiles into the WASM binary once that option is set.

## Acceptance criteria

- [ ] The template is generated, and `workflow-cre/` stays outside the pnpm workspace with its own
      `pnpm-workspace.yaml`, per decision T7.
- [ ] The generated `tsconfig.json` sets `allowImportingTsExtensions`, the relative import of
      `shared/` resolves, and the tests run from inside `workflow-cre/`.
- [ ] `handlerInTee` runs against a placeholder payload and the CRE CLI reports success.
- [ ] The files the CLI owns are listed in the ticket, so a regeneration does not silently drop
      local edits.

## Comments

## Dev review

Not reviewed yet.
