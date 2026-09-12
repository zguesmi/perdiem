# Evidence: Privy server wallets on Arc testnet

Run date: 2026-09-09. Answers `docs/scratch/verification/issues/06-privy-server-wallets-on-arc.md`
and row V6 of `docs/decisions.md`.

App secret and the `Authorization: Basic` header are redacted. The two P-256 authorization keys were
generated for this run only and are not stored in the repo.

Objects created on the Privy app during the run:

- policy `x8ua10zjj76xsx0jl86o3jqn`
- wallet `ivxhmunq96gjv7pwn4qac95z` — `0xB039A328e7e05c7034d5f76049718eBBeD017628`, policy only
- key quorum `etxu7sm618a1zpzmnd7uqorp` — 2-of-2
- wallet `r3glnn5zh9vg9hhmwfjf3xwx` — `0x53D8b1B62B1084E977B1Fd3f60D1FdB3491F3dB0`, quorum owner plus
  policy

## 1. A policy rule accepts the Arc chain id

Request:

```
POST https://api.privy.io/v1/policies
{
  "version": "1.0",
  "name": "Perdiem Arc testnet only",
  "chain_type": "ethereum",
  "rules": [
    {
      "name": "Only allow signing on Arc testnet",
      "method": "eth_signTransaction",
      "conditions": [
        { "field_source": "ethereum_transaction", "field": "chain_id", "operator": "eq", "value": "5042002" }
      ],
      "action": "ALLOW"
    }
  ]
}
```

Response, HTTP 200:

```json
{"id":"x8ua10zjj76xsx0jl86o3jqn","name":"Perdiem Arc testnet only","chain_type":"ethereum","rules":[{"id":"jb1dssj0zkmhuh2gioswoxwn","name":"Only allow signing on Arc testnet","method":"eth_signTransaction","conditions":[{"field_source":"ethereum_transaction","field":"chain_id","operator":"eq","value":"5042002"}],"action":"ALLOW"}],"version":"1.0","created_at":1788935477137,"owner_id":null}
```

## 2. The policy allows chain 5042002 and denies chain 1

`eth_signTransaction` with `chain_id: 5042002`, HTTP 200:

```json
{"method":"eth_signTransaction","data":{"signed_transaction":"0x02f86d834cef5280843b9aca00847735940082520894b039a328e7e05c7034d5f76049718ebbed0176288080c080a07dfef323959508b8aab3cb7015c9a899c936b865fd3a6c5855274fba31de498ea07e9fb382884dd7e226f3b708e79b694935b045cb63966c9ea5bfb703f64e3ec9","encoding":"rlp"}}
```

The same request with `chain_id: 1`, HTTP 400:

```json
{"error":"RPC request denied due to policy violation","code":"policy_violation"}
```

## 3. Privy will not broadcast on Arc

`eth_sendTransaction` with `"caip2": "eip155:5042002"`, HTTP 401:

```json
{"error":"App is not authorized to transact on chain eip155:5042002"}
```

`eth_signTransaction` takes no `caip2` argument. The chain id sits inside the transaction object and
the response is the RLP of the signed transaction, so the purchaser service broadcasts it to
`ARC_RPC_URL` itself.

## 4. A 2-of-2 key quorum was created and is enforced

Created with two P-256 public keys and `"authorization_threshold": 2`, HTTP 200:

```json
{"id":"etxu7sm618a1zpzmnd7uqorp","display_name":"Perdiem travel+finance 2of2","authorization_threshold":2,"authorization_keys":[{"public_key":"MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEFM87et+kvPYyKVgJVITLBoP2+T4W2vYEc7xFVGqPLVUhvKf9oqxjww2nbVRjE0dRl7nsjHs8AwVzlVzrmMirZQ==","display_name":null},{"public_key":"MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEyM3YFLs1bwqLRw2pzpTh/NmWrkxROZOSgV1aYaGfV6anstZyE/cppMndHP7dKav2mmQFeutpnjABqMSamMUlPg==","display_name":null}],"user_ids":[],"key_quorum_ids":[]}
```

Signing against the quorum-owned wallet with no `privy-authorization-signature` header, HTTP 401:

```json
{"error":"Missing `privy-authorization-signature` header or no signatures provided. Learn more about authorization signatures here: https://docs.privy.io/api-reference/authorization-signatures"}
```

With one of the two signatures, HTTP 401:

```json
{"error":"Number of signatures in `privy-authorization-signature` header does not match the wallet's authorization threshold."}
```

With both signatures, comma-separated in one header, HTTP 200:

```json
{"method":"eth_signTransaction","data":{"signed_transaction":"0x02f86e834cef5280843b9aca008506fc23ac008252089453d8b1b62b1084e977b1fd3f60d1fdb3491f3db08080c080a067a09fa6963aea34578fa41d3d3a835e11a9048ee4b645052c6d371fa50861aea03a318eff8652f3846a679311a00bae4998117ff5b0af1eb80f481c7ced4664da","encoding":"rlp"}}
```

The signature payload is RFC 8785 canonical JSON over
`{version, method, url, body, headers: {"privy-app-id"}}`, signed ECDSA P-256 with SHA-256 and
base64-encoded.

## 5. A quorum-signed transaction is on Arc testnet

The buyer funded the quorum wallet with 0.5 native USDC, transaction
`0x052a3b2913dd002f2686d62362abbf76839266ead3a6c533f031d8469d0c14a1`.

Privy then signed a 0.1 USDC transfer back to the buyer under the 2-of-2 quorum. Broadcast through
`ARC_RPC_URL`:

```json
{"jsonrpc":"2.0","id":1,"result":"0x048b67e22490488f2c3c58fb5afabd126d0f60afd1319a7cf24937e040a86982"}
```

Receipt, trimmed:

```json
{"type":"0x2","status":"0x1","blockNumber":"0x3a5cac9","gasUsed":"0x5208","effectiveGasPrice":"0x4e3b29200","from":"0x53d8b1b62b1084e977b1fd3f60d1fdb3491f3db0","to":"0x746e3d03d7ba18657de97ee95aa1a1654e925d4d","contractAddress":null}
```

`eth_chainId` on `https://rpc.testnet.arc.io` returned `0x4cef52`, which is 5042002.
