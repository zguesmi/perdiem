# @perdiem/tsconfig

The TypeScript settings every Perdiem package shares. One file, so the settings cannot drift between
packages that have to agree on hashes.

```json
{
  "extends": "@perdiem/tsconfig/base.json"
}
```

`onchain/` is the exception: Hardhat generates its own `tsconfig.json`, and that file is left as the
template produced it.
