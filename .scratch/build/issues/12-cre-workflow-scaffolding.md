# Generate the CRE workflow with the official template

Status: ready-for-human
Blocked by: ../verification/issues/10-confidential-workflows-beta-access.md, ../verification/issues/02-enclave-chain-read-and-confidential-http.md

`cre init --template=hello-confidential-workflows-ts`. The CLI owns the generated package.json,
which is why `workflow/` is outside the pnpm workspace.

After generating, check that the `file:../packages/core` dependency survived. The fixture hash test
is there to fail loudly if it did not.

## Comments
