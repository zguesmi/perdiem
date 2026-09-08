# Scoring lives in the workflow, not in the shared package

`packages/core` holds everything the buyer, the suppliers and the contract have to agree on: the
domain types, canonical JSON, the Policy Hash and the EIP-712 hashing. The obvious next step is to
put the scoring function there too, since it is pure, deterministic and easy to unit test.

It is deliberately not there. A supplier agent depends on `@perdiem/core`, so scoring in that package
is scoring a supplier can import, read, and brute-force its own price against. The product claims the
selection rule is private from the platform and from the suppliers; a shared scoring function makes
that claim false in the repository itself, where any judge can see it.

Scoring lives in `workflow/`, which nothing else depends on, and it runs inside `handlerInTee`.

## Consequences

The demo scoring table is tested in `workflow/`, not in `packages/core`. The web UI cannot recompute
why a bid won; it renders the Settlement and, after the auction, the revealed Policy. The hashing
code stays shared, because the buyer and the enclave producing different bytes is what kills an
auction, and that risk is worth a shared package. The scoring code does not carry that risk.
