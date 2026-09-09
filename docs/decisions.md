# Verified facts

Things with a single right answer, checked rather than assumed. Trade-offs is in `docs/adr/`
instead, and the reasoning behind the project's shape is in `docs/grilling-session.md`.

Each open row has a ticket in `docs/scratch/verification/`. Nothing downstream of an open row gets
written until the row is closed.

## How to write a row

One line for the fact, then a sub-bullet linking the ticket and a sub-bullet linking the evidence
file. Nothing else. The commands, the requests, the responses and the reasoning live in the ticket
and the evidence file, and are never repeated here. Rows are sorted by ticket number.

## Toolchain

- `hardhat --init` runs without a terminal, with `--template`. Bare `--init` fails with `HHE11`, an
  unknown template with `HHE25`. Ran it.
- The Hardhat templates are `node-test-runner-viem`, `mocha-ethers` and `minimal`. From the `HHE25`
  error output.
- Hardhat 3 does not use TypeChain. The viem toolbox emits types into `artifacts/`. Inspected the
  generated project.
- The template pins solc 0.8.34, evm target `osaka`. From the generated `hardhat.config.ts`.
- This Node cannot run TypeScript directly. `node --experimental-strip-types` fails with
  `ERR_NO_TYPESCRIPT`; `tsx` runs the same `node:test` API. Ran both.
- pnpm 12 allows install scripts through `allowBuilds:` in `pnpm-workspace.yaml`, not
  `onlyBuiltDependencies`. pnpm wrote the key itself.
- `pnpm install` inside `workflow/` installs the root workspace unless `workflow/` has its own
  `pnpm-workspace.yaml`. Ran it.

## Arc testnet

- V5 — USDC is native and pays gas, with an ERC-20 interface at
  `0x3600000000000000000000000000000000000000`, 6 decimals. Gas is quoted in 18-decimal units and
  never enters a Policy, Bid or Settlement.
  - Ticket:
    [05 — Arc USDC address and decimals](scratch/verification/issues/05-arc-usdc-address-and-decimals.md)
- V11 — Hardhat `chainType` is `l1`.
  - Ticket: [11 — Arc Hardhat chainType](scratch/verification/issues/11-arc-hardhat-chaintype.md)
- V12 — chain id 5042002, RPC `https://rpc.testnet.arc.io`, WS `wss://rpc.testnet.arc.io`, explorer
  `https://testnet.arcscan.app`.
  - Ticket:
    [12 — Arc chain id and RPC endpoint](scratch/verification/issues/12-arc-chain-id-and-rpc-endpoint.md)
- Fees: EIP-1559 plus EWMA, target ~$0.01/tx, floor 20 Gwei, ceiling 20,000 Gwei. 0.5 s blocks, 30M
  gas per block. Osaka baseline plus EIP-7708.

## Privy

- V6 — server wallets sign on chain id 5042002 with `eth_signTransaction`, and a policy rule pins
  the chain id. `eth_sendTransaction` refuses Arc, so Privy signs and the requisition service
  broadcasts to `ARC_RPC_URL`. A 2-of-2 key quorum enforces on the app in use, so there is no
  policy-only fallback.
  - Ticket:
    [06 — Privy server wallets on Arc](scratch/verification/issues/06-privy-server-wallets-on-arc.md)
  - Evidence: [06 — Privy server wallets on Arc testnet](evidence/06-privy-server-wallets-on-arc.md)

## Chainlink CRE

- V1 — `cre workflow simulate` writes to Arc only with `--broadcast`, signing with
  `CRE_ETH_PRIVATE_KEY`. The forwarder is `0x6e9ee680ef59ef64aa8c7371279c27e496b5edc1`,
  `MockKeystoneForwarder 1.0.0-dev`, the same address for any signing key. It skips a receiver whose
  `supportsInterface(0xffffffff)` returns `true`, and `writeReport` reports `TxStatus.SUCCESS`
  anyway. `arc-testnet` is in the chain-selectors registry, selector `3034092155422581607`.
  - Ticket:
    [01 — CRE simulate writes to Arc](scratch/verification/issues/01-cre-simulate-writes-to-arc.md)
  - Evidence: [01 — CRE simulate writing to Arc testnet](evidence/01-cre-simulate-writes-to-arc.md)
- V2 — `handlerInTee` reads the chain and calls confidential HTTP in simulation. The Enclave builds
  the Bids Root itself, the preferred path. `EVMClient.callContract` is typed for `Runtime`, so the
  `TeeRuntime` goes through a cast; the cast costs nothing, because `TeeRuntimeImpl.callCapability`
  delegates to the `RuntimeImpl` that `usingTheDons()` returns. Confidential HTTP is
  `cre.capabilities.HTTPClient` with the TEE runtime, `http-actions@1.0.0-alpha`, not
  `ConfidentialHTTPClient`, `confidential-http@1.0.0-alpha`.
  - Ticket:
    [02 — Enclave chain read and confidential HTTP](scratch/verification/issues/02-enclave-chain-read-and-confidential-http.md)
  - Evidence:
    [02 — The chain read and confidential HTTP inside handlerInTee](evidence/02-enclave-chain-read-and-confidential-http.md)
- V3 — the enclave decrypts a sealed bid. `runtime.getSecret()` returns a 32-byte X25519 private key
  inside `handlerInTee` and a sealed bid opens in 11 ms, three in 30 ms. The runtime exposes no
  crypto of its own: `crypto`, `crypto.subtle`, `crypto.getRandomValues` and `WebAssembly` are
  `undefined` and `node:crypto` is refused at build, so every primitive is pure JavaScript from
  `@noble/*`. It cannot generate a keypair, for want of randomness. X25519 with HKDF-SHA256 and
  XChaCha20-Poly1305 is the scheme, per `docs/adr/0005-sealed-bid-envelope-scheme.md`; NaCl
  `crypto_box`, libsodium sealed box, secp256k1 ECIES and AES-256-GCM also work, and HPKE through
  `@hpke/core` does not.
  - Ticket:
    [03 — Enclave decrypts sealed bids](scratch/verification/issues/03-enclave-decrypts-sealed-bids.md)
  - Evidence: [03 — The enclave decrypts a sealed bid](evidence/03-enclave-decrypts-sealed-bids.md)
- V4 — `secrets.yaml` maps a secret id to an environment variable name and holds no values, and
  `-e .env` is required for the CLI to resolve them. The limit is 131,072 bytes per secret and it is
  the operating system's, not CRE's: 131,100 characters fail the build with `E2BIG`. The canonical
  Policy is 425 characters and a base64 X25519 private key is 44, so neither needs trimming. The
  Vault DON path is unverified, because `cre secrets create` needs deploy access.
  - Ticket:
    [04 — Workflow secrets in simulation](scratch/verification/issues/04-workflow-secrets-in-simulation.md)
  - Evidence: [04 — Workflow secrets in simulation](evidence/04-workflow-secrets-in-simulation.md)
- V8 — one workflow run makes two `writeReport` calls to the same contract, both `TxStatus.SUCCESS`,
  both under one `workflowExecutionId`, and the second sees the state the first committed:
  `writeReport` blocks until its transaction is mined, about 1.4 seconds each on Arc testnet. So the
  claim and the settlement fit one cron tick and the interval stays at 60 seconds. `evm@1.0.0` has
  one write RPC and no calldata field, so every write lands on `onReport(bytes,bytes)` and
  `startSettling` has to be a second report with a kind in its body; `report.reportId()` is `0001`
  for both reports, so the kind cannot live there. A reverting `onReport` still reports
  `TxStatus.SUCCESS` to the workflow.
  - Ticket:
    [08 — Two writes per workflow run](scratch/verification/issues/08-two-writes-per-workflow-run.md)
  - Evidence:
    [08 — Two chain writes in one workflow run](evidence/08-two-writes-per-workflow-run.md)
- V10 — the Confidential Workflows private beta gates deployment, not simulation.
  `cre workflow simulate` ran the confidential template on an account with no deploy access, and the
  secret resolved inside `handlerInTee`. The simulator is not a real TEE and attests nothing.
  - Ticket:
    [10 — Confidential Workflows beta access](scratch/verification/issues/10-confidential-workflows-beta-access.md)
  - Evidence:
    [10 — Confidential Workflows without beta approval](evidence/10-confidential-workflows-beta-access.md)
- V13 — the handler reaches a relay on `http://localhost:8787` in simulation, `200` in 5 to 7 ms,
  because the HTTP capability runs in the CLI's own process and the request arrives from
  `127.0.0.1`. No allow list and no TLS: plain `http` is permitted and `https` against an HTTP
  server fails with `http: server gave HTTP response to HTTPS client`. A relay that is down throws
  `connection refused`, while an unknown auction returns `200` with `[]`, so the two stay
  distinguishable. A deployed workflow cannot reach a developer's localhost.
  - Ticket:
    [13 — Can the enclave reach the relay](scratch/verification/issues/13-can-the-enclave-reach-the-relay.md)
  - Evidence:
    [13 — The confidential handler reaches a relay on localhost](evidence/13-can-the-enclave-reach-the-relay.md)

## Circle

- V7 — the first `circle wallet login <email> --testnet` provisions an agent wallet on
  `ARC-TESTNET`, Circle's faucet funds it 20 USDC per drip, and `circle wallet execute` broadcasts a
  contract call. `circle wallet sign typed-data` signs the `Bid` type, but the wallet is an ERC-4337
  contract account, so the signature recovers to the account's owner key and must be checked with
  ERC-1271 `isValidSignature` against the supplier address.
  - Ticket:
    [07 — Circle Agent Stack wallets](scratch/verification/issues/07-circle-agent-stack-wallets.md)
  - Evidence:
    [07 — Circle Agent Stack wallets on Arc testnet](evidence/07-circle-agent-stack-wallets.md)
- Circle spending policies are mainnet only. `circle wallet limit` refuses a testnet chain, so an
  agent wallet on Arc testnet runs on Circle's default policy.
- The CLI authenticates as a Circle user against `agentic-wallet.circle.com`, on `/v1/w3s/user/...`
  with a `userToken` from email OTP. It accepts no console API key, so Circle Console API Logs stay
  at zero. The session lasts 28 days.

## LiteAPI

- V9 — the booking id is `data.bookingId` in the `POST /rates/book` response, nine URL-safe base64
  characters, and it is what the Receipt hashes. Prebook returns a separate `data.prebookId`. The
  sandbox payment method is `payment.method` set to `"ACC_CREDIT_CARD"`; a missing or unknown value
  fails with code `5000`. The id is stable across later reads of `GET /bookings/{bookingId}`, but
  `book` is not idempotent on the prebook id, so the agent sets `clientReference` to the `auctionId`
  and a repeat is refused with code `4005`.
  - Ticket:
    [09 — LiteAPI booking id and payment method](scratch/verification/issues/09-liteapi-booking-id-and-payment-method.md)
  - Evidence:
    [09 — The LiteAPI booking id and the sandbox payment method](evidence/09-liteapi-booking-id-and-payment-method.md)
