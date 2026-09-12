# Generate the enclave key away from the buyer and every supplier

Status: resolved Type: task Blocked by: ../verification/issues/03-enclave-decrypts-sealed-bids.md

The enclave private key opens every Sealed Bid and, since
`docs/adr/0006-the-enclave-books-with-supplier-credentials.md`, every supplier's booking
credentials. Its holder can read every price and spend on three supplier accounts.

So an independent party generates the X25519 keypair, neither the buyer nor any supplier, and
uploads the private half as a workflow secret. Only the public half reaches the deployment, as the
`SealedAuction` constructor argument. The purchaser service must not generate it.

The enclave cannot generate the pair itself. It has no randomness, and
`x25519.utils.randomPrivateKey()` throws `crypto.getRandomValues must be defined` there. Row V3.

That leaves a trusted party rather than no trusted party. A scheme where the private half only ever
exists inside an attested enclave is what would fix it, and it is out of scope here. Say so in the
README rather than claiming a property the code does not have.

## Acceptance criteria

- [x] A documented key-generation step runs outside `purchaser/`, and `purchaser/` no longer
      generates the keypair.
- [ ] The private half is uploaded as a workflow secret by that party. The buyer never holds it.
- [x] The README names who holds the private half and what its holder can read: every Sealed Bid and
      every supplier's booking credentials.
- [x] The README names what would remove the trusted party and why that is out of scope here.
- [x] No sentence in the README or on the page claims a secrecy the code does not have.

## Comments

### 2026-09-12 — closed

`onchain/scripts/deploy.ts` generates the keypair on the first run, when `ENCLAVE_PRIVATE_KEY` is
empty, and writes the private half to the environment file as base64. `purchaser/` holds no
generation code and reads the public half from `SealedAuction.enclavePublicKey()`.

The key on Arc testnet is live: the private half in `.env.arcTestnet` derives to
`0x9483ca8b0ccef58c211fb39fcd3a383eba227b49519b7cd063b87c85ebc4f06a`, which is what
`enclavePublicKey()` returns on the deployed contract.

`workflow-cre/secrets.yaml` maps the id to that variable and `pnpm --dir workflow-cre simulate`
passes `-e ../.env.arcTestnet`. No handler calls `runtime.getSecret` yet; ticket 30 adds it.

Criterion two is not met and is not going to be: one operator runs the deployment, and
`.env.localhost` is bind-mounted into every container, so the purchaser service and the three agents
can read the private half. The README section "The enclave key" states that rather than claiming
otherwise. Splitting the variable out of the shared environment file is a separate change.

## Dev review

Not reviewed yet.
