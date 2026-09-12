# Generate the CRE workflow with the official template

Status: resolved Type: task Blocked by:
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

- [x] The template is generated, and `workflow-cre/` stays outside the pnpm workspace with its own
      `pnpm-workspace.yaml`, per decision T7.
- [x] The generated `tsconfig.json` sets `allowImportingTsExtensions`, the relative import of
      `shared/` resolves, and the tests run from inside `workflow-cre/`.
- [x] `handlerInTee` runs against a placeholder payload and the CRE CLI reports success.
- [x] The files the CLI owns are listed in the ticket, so a regeneration does not silently drop
      local edits.

## Answer

The template is `hello-confidential-workflows-ts` on CRE CLI 1.32.0, flattened: the CRE project root
and the workflow folder are one directory, so there is one `package.json` and one `tsconfig.json`
instead of two of each. `cre workflow simulate .` accepts that layout.

What the template shipped and this package does not keep: its own `main.ts` body, `workflow.ts`
handler, README and `.env.example`.

Both targets are kept and both simulate. They differ by name only, and a second target makes
`--target` mandatory under `--non-interactive`:
`multiple targets found in project.yaml and --non-interactive is set`.

`secrets.yaml` is kept too, mapping `POLICY` and `ENCLAVE_PRIVATE_KEY` to variables of the same
name. The CLI resolves them at compile time from the file passed with `-e`, so every variable it
names has to exist even while no handler reads it, and an empty value is accepted. A probe read both
inside `handlerInTee` and logged `policyChars=52 skChars=44`, never a value. `POLICY=` is now in
both `.env` examples.

`src/main.ts` must export `main`; the toolchain calls it. A module that does not export it fails to
compile with `Error: JS module does not export main`. The template's trailing `main()` call is not
needed, and dropping it keeps the runner from starting twice.

`tsconfig.json` needs `moduleResolution: "bundler"` on top of `allowImportingTsExtensions`.
`@chainlink/cre-sdk` publishes its types through `exports` only, and Node20 resolution reports
`Module '"@chainlink/cre-sdk"' has no exported member 'Runner'`.

The relative import of `shared/` compiles into the WASM binary and runs inside the enclave. Probed
with `canonicalJson` from `shared/canonical-json.ts`, which logged `{"probe":1}` from inside
`handlerInTee`, then removed rather than left in as dead code.

The run:

```
$ pnpm --dir workflow-cre simulate
✓ Workflow compiled
Running trigger trigger=cron-trigger@1.0.0
[USER LOG] enclave reached
✓ Workflow Simulation Result:
"no auction pending"
```

### The files the CLI owns

A regeneration overwrites the shape of these nine, so local edits to them are the edits to re-apply
by hand: `project.yaml`, `workflow.yaml`, `config.json`, `config.production.json`, `secrets.yaml`,
`src/main.ts`, `src/workflow.ts`, `package.json`, `tsconfig.json`.

## Comments

## Dev review

Not reviewed yet.
