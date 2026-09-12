# Evidence: Circle Agent Stack wallets on Arc testnet

Run date: 2026-09-09. Answers `docs/scratch/verification/issues/07-circle-agent-stack-wallets.md`
and row V7 of `docs/decisions.md`.

The login email and the OTP are redacted. The OTP is password-equivalent and was typed by the
operator, never handled by the agent.

- CLI: `@circle-fin/cli` 1.0.0, installed as a root devDependency, run through `pnpm circle`.
- Agent wallet: `0x4d932db1979443e6abe8a5c57171e31ea9620484` on `ARC-TESTNET`, created
  2026-09-09T09:25:40Z.
- Owner key recovered from the bid signature: `0x76530A6f14b60163341aE9aA494E0E67A4cB9B61`.

## 1. Terms gate gets in the way of a headless run

`circle wallet status` before acceptance:

```json
{
  "error": {
    "code": "PERMISSION_DENIED",
    "message": "Circle CLI Terms acceptance is required before use.",
    "hint": "Set CIRCLE_ACCEPT_TERMS=1 to accept in non-interactive shells (CI, scripts, sandboxed agents)."
  }
}
```

Accepted by the operator. Terms of Use `https://agents.circle.com/terms-of-use`.

## 2. Mainnet and testnet are separate sessions

`circle wallet list --chain ARC-TESTNET` with a valid mainnet session:

```json
{
  "error": {
    "code": "AUTH_REQUIRED",
    "message": "Not logged in (or session expired). Run `circle wallet login <email> --testnet` and retry."
  }
}
```

`--testnet` is absent from `circle wallet login --help`. After the operator ran
`circle wallet login <redacted> --testnet`:

```json
{
  "data": {
    "type": "agent",
    "mainnet": { "email": "<redacted>", "tokenStatus": "VALID", "expiresIn": "28d 53m" },
    "testnet": { "email": "<redacted>", "tokenStatus": "VALID", "expiresIn": "28d 59m" }
  }
}
```

## 3. Arc testnet is on the CLI's chain list

`circle blockchain list`, the Arc entry:

```json
{
  "blockchain": "ARC-TESTNET",
  "name": "Arc Testnet",
  "evmChainId": 5042002,
  "rpcUrl": "https://rpc.testnet.arc.network"
}
```

Chain id matches row V12. There is no Arc mainnet entry, only the testnet.

Both `https://rpc.testnet.arc.network` and `https://rpc.testnet.arc.io` answer `eth_chainId` with
`0x4cef52`, which is 5042002. The two hosts are aliases.

## 4. Item 1: a wallet exists on Arc testnet and holds USDC

The first login provisions one wallet per supported chain, so `circle wallet create` was never
needed. `circle wallet login --help` names "ETH, BASE, ARB, POLY, OP, AVAX, UNI, and their
testnets" and omits Arc, but the wallet is there:

```json
{
  "data": {
    "wallets": [
      {
        "type": "agent",
        "address": "0x4d932db1979443e6abe8a5c57171e31ea9620484",
        "blockchain": "ARC-TESTNET",
        "createDate": "2026-09-09T09:25:40Z"
      }
    ]
  }
}
```

`circle wallet fund --address 0x4d93… --chain ARC-TESTNET --token usdc` drips from Circle's own
faucet. Balance after:

```json
{
  "balances": [
    {
      "amount": "20",
      "token": { "symbol": "USDC", "decimals": 18, "isNative": true }
    },
    {
      "amount": "20",
      "token": {
        "symbol": "USDC",
        "decimals": 6,
        "isNative": false,
        "tokenAddress": "0x3600000000000000000000000000000000000000"
      }
    }
  ]
}
```

Two views of the same 20 USDC: the native balance in 18-decimal units and the ERC-20 interface in 6.
That is row V5 seen from the other side.

20 USDC per drip is under the 50 USDC `STAKE` constant, so a supplier agent needs more than one
drip, or a lower demo Stake.

## 5. Item 2: the wallet signs and broadcasts a contract call

`approve(address,uint256)` on the USDC ERC-20 interface, the call `commit` needs before it can pull
the Stake. `SealedAuction` is not deployed yet, so the spender is a placeholder.

Estimate first:

```
circle wallet execute "approve(address,uint256)" 0x…dEaD 50000000 \
  --contract 0x3600000000000000000000000000000000000000 \
  --address 0x4d932db1979443e6abe8a5c57171e31ea9620484 --chain ARC-TESTNET --estimate
```

```json
{
  "gasLimit": "1001499",
  "networkFee": "0.043427510133086769",
  "baseFee": "20",
  "callGasLimit": "89198",
  "verificationGasLimit": "278174",
  "preVerificationGas": "77779"
}
```

`verificationGasLimit` and `preVerificationGas` are ERC-4337 fields. First sign that the wallet is a
smart contract account, not an externally owned account.

Broadcast:

```json
{
  "id": "6ff5c8b3-f73c-55e2-b2e2-853532b45837",
  "state": "COMPLETE",
  "blockchain": "ARC-TESTNET",
  "txHash": "0x4c2a9463fdf77ba931f9b3fef67fbb105b58e15308f92a0af4e69b1367d0d55a",
  "sourceAddress": "0x4d932db1979443e6abe8a5c57171e31ea9620484",
  "operation": "CONTRACT_EXECUTION",
  "abiFunctionSignature": "approve(address,uint256)",
  "contractAddress": "0x3600000000000000000000000000000000000000",
  "blockHeight": 61217031,
  "networkFee": "0.008442741279"
}
```

State change confirmed by reading it back. `allowance(0x4d93…, 0x…dEaD)`:

```
0x0000000000000000000000000000000000000000000000000000000002faf080   // 50000000
```

## 6. Item 3: the wallet signs EIP-712, but not with its own address

`circle wallet sign typed-data` over the `Bid` type from `docs/spec.md`, domain
`{ name: "Perdiem", version: "1", chainId: 5042002, verifyingContract: 0x…01 }`. The verifying
contract is a placeholder until `SealedAuction` is deployed.

```json
{
  "signature": "0x10ab3521891174ed8fae607c9da2b54bb351866bbf538b96b33bafcf9a3d23970b1897dbf2e83e50f9326761a316cf9a829aa25d6cdf43e67d48732135c7df211c"
}
```

65 bytes, `v = 0x1c`. A plain ECDSA signature, not an ERC-1271 blob.

`viem` `hashTypedData` and `recoverTypedDataAddress` over the same typed data:

```
digest    0x00311b3e988ddf8621654993b4976060cd001ac48292ab319c985daa35741066
recovered 0x76530A6f14b60163341aE9aA494E0E67A4cB9B61
```

The recovered address is the account's owner key, not the wallet. `ecrecover` cannot produce
`0x4d93…`, so the Enclave's signature check as specified would drop every bid from a Circle agent
wallet.

`eth_getCode` on the wallet returns a proxy whose storage slot is
`0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc`, the ERC-1967 implementation
slot. The wallet is a contract.

The contract validates the same digest and signature through ERC-1271. `eth_call` to
`isValidSignature(bytes32,bytes)` on `0x4d93…`:

```
0x1626ba7e00000000000000000000000000000000000000000000000000000000
```

That is the ERC-1271 magic value. The signature is valid **for the wallet address**, checked on
chain rather than recovered.

`owner()`, `getOwners()` and `eip712Domain()` all revert, so the owner key is not readable from the
account's interface.

## 7. Spending policies are mainnet only

`circle wallet limit --help`:

```
-c, --chain <chain>    Mainnet blockchain (required; testnets not supported)
```

Same for `limit set`, `limit reset` and `limit budget`. `set` and `reset` also require a human OTP.
On `ARC-TESTNET` the code-default policy applies and cannot be read or changed.

## 8. The run does not appear in the Circle Console

Console API Logs on Testnet showed `0 Total Requests` after every command above. That is correct,
not a fault.

Hosts and paths in the CLI bundle:

- `https://agentic-wallet.circle.com` — the host for agent wallet operations
- `/v1/w3s/sdk/users/email/verifyOTP` — the email OTP login
- `/v1/w3s/user/wallets`, `/v1/w3s/user/sign/typedData`,
  `/v1/w3s/user/transactions/contractExecution` — the wallet, signing and execution calls

Every path is `/v1/w3s/user/...`, the user-scoped API. Console API Logs count requests authenticated
with an app's API key, which is the `/v1/w3s/developer/...` path. None were made.

The stored session at `~/.circle-cli/profiles/agent/session.json` holds `userToken`,
`encryptionKey`, `encryptedUserSecret`, `deviceId` and `expiresAt` per network. No app id, no API
key. The bundle resolves the app id with `appId = await client.getAppId(...)` from Circle's proxy,
and exposes no `--api-key` flag or `CIRCLE_API_KEY` variable, so the CLI cannot be pointed at a
console app.

Where the activity is instead:

- `circle transaction list --address 0x4d93… --chain ARC-TESTNET` — the faucet drip in, tx
  `0x74d42a2ffb633d39cc19fa5d433e979e22ab31a594a65d0f123f439b4045d438`, and the `approve` out.
- `https://testnet.arcscan.app` — both transactions on chain.
