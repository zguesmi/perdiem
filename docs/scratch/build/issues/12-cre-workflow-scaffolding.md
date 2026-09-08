# Generate the CRE workflow with the official template

Status: ready-for-human Type: task Blocked by:
../verification/issues/10-confidential-workflows-beta-access.md,
../verification/issues/02-enclave-chain-read-and-confidential-http.md

`cre init --template=hello-confidential-workflows-ts`. The CLI owns the generated package.json,
which is why `workflow/` is outside the pnpm workspace.

After generating, check that the `file:../packages/core` dependency survived. The fixture hash test
is there to fail loudly if it did not.

## Acceptance criteria

- [ ] The template is generated, and `workflow/` stays outside the pnpm workspace with its own
      `pnpm-workspace.yaml`, per decision T7.
- [ ] The `file:../packages/core` dependency resolves, and the fixture hash test runs from inside
      `workflow/`.
- [ ] `handlerInTee` runs against a placeholder payload and the CRE CLI reports success.
- [ ] The files the CLI owns are listed in the ticket, so a regeneration does not silently drop
      local edits.

## Comments
