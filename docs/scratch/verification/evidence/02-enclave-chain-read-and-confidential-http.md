# Evidence: the chain read and confidential HTTP inside `handlerInTee`

Run date: 2026-09-09. Answers
`docs/scratch/verification/issues/02-enclave-chain-read-and-confidential-http.md` and row V2 of
`docs/decisions.md`.

CRE CLI `v1.32.0`, template `hello-confidential-workflows-ts`. The project was scaffolded in a
scratch directory, not in `workflow-cre/`, so nothing in the repo depends on it. One throwaway contract
was deployed to Arc testnet. Both `@chainlink/cre-sdk` 1.18.0, the version the template pins, and
1.20.0, the current release, were run.

## 1. The contract under the read

`CommitStore` on Arc testnet at `0x702ec9b8591bb7091204b8070f32834e3aadc3b7`. It is a stand-in for
the two enclave-facing views of `SealedAuction`:

```solidity
function commitmentsOf(bytes32 auctionId) external view returns (bytes32[] memory);
function pendingSettlement() external pure returns (bytes32);
```

Three commitments were written for auction `0x00…01`, deliberately out of ascending order, so a
sorted root differs from an arrival-order one:

```
0xcccc…cc03   tx 0x75cc5d4eedbe798cc7e6775016c75633ad6a1556d0e2e8e7b5deda2f79c7a7d7
0xaaaa…aa01   tx 0x1fb7f2799a2a52e6900a9ffabbf9762ac20074a1aadf9ce7ddecb4d7a11072b0
0xbbbb…bb02   tx 0x51bb34edb2f3b3744cf7e9f2c24617f36eab529e14b3491b9f84640faa5befe0
```

The last is block 61210928, `status: 0x1`. Hardhat read the same three back in arrival order and
computed the expected root over the sorted set:

```
keccak256(abi.encodePacked(sorted)) = 0x1aa6f0f959f41fdb5848e9a24fce1f663256ef9311a4697c2da1e801eac59ca8
```

## 2. Four probes in one TEE handler

`onCronTrigger` takes a `TeeRuntime` and runs, in order: the chain read from the TEE runtime, the
same read after `usingTheDons()`, an `HTTPClient` call with the TEE runtime and a Vault secret, and
a `ConfidentialHTTPClient` call. Each probe is wrapped in `try`/`catch` so one failure does not hide
the others. The RPC is `project.yaml`, `chain-name: arc-testnet`.

```
$ cre workflow simulate v2 --non-interactive --target staging-settings --trigger-index 0
✓ Workflow compiled
  Binary hash: 880e88a9e1bf3254ea21bf51fb2b6b8096beac9d070e0941e3f87f1484b488c4
  Config hash: e1c99a2f48b81516187730c470d91222c8a10c177cceabf2801e73c41a328de5

Running trigger trigger=cron-trigger@1.0.0
╭─ Trigger requested TEE Execution your trigger will run in one of the following Tees:
│     - AWS Nitro in us-west-2
│ The simulator is not a real TEE, and is meant to debug.
╰─

[USER LOG] chain read in tee: ok count=3 root=0x1aa6f0f959f41fdb5848e9a24fce1f663256ef9311a4697c2da1e801eac59ca8
[USER LOG] chain read on don: ok count=3 root=0x1aa6f0f959f41fdb5848e9a24fce1f663256ef9311a4697c2da1e801eac59ca8
[USER LOG] confidential http: ok status=200 secretReachedApi=true
[USER LOG] confidential-http capability: ok status=200

✓ Workflow Simulation Result:
"tee=[ok count=3 root=0x1aa…9ca8] don=[ok count=3 root=0x1aa…9ca8] http=[ok status=200 secretReachedApi=true] confhttp=[ok status=200]"
```

Both roots equal the root Hardhat computed off chain. The enclave decoded a `bytes32[]` return, so a
dynamic array survives the round trip.

`secretReachedApi=true` is the handler asserting that `runtime.getSecret()` resolved inside
`handlerInTee` and that the value reached the HTTP call, without logging the token.

## 3. The EVM client is typed for `Runtime`, not `TeeRuntime`

`callContract` takes `Runtime<unknown>`. `TeeRuntime` is not assignable to it, in 1.18.0 and 1.20.0
alike:

```
workflow.ts(94,4): error TS2345: Argument of type 'TeeRuntime<…>' is not assignable to parameter of
type 'Runtime<…>'. Type 'TeeRuntime<…>' is missing the following properties from type 'Runtime<…>':
runInNodeMode, report
```

`HTTPClient.sendRequest` is the only capability with a `NodeRuntime | TeeRuntime` overload. So the
chain read needs a cast:

```ts
client.callContract(runtime as unknown as Runtime<Config>, { call: { to, data } })
```

The cast changes nothing at runtime. `TeeRuntimeImpl.callCapability` delegates straight to the
`RuntimeImpl` that `usingTheDons()` returns:

```js
// @chainlink/cre-sdk/dist/sdk/impl/runtime-impl.js
export class TeeRuntimeImpl {
    constructor(config, nextCallId, helpers, maxResponseSize) {
        this.runtime = new RuntimeImpl(config, nextCallId, helpers, maxResponseSize);
    }
    callCapability({ capabilityId, method, payload, inputSchema, outputSchema }) {
        return this.runtime.callCapability({ capabilityId, method, payload, inputSchema, outputSchema });
    }
    usingTheDons() { return this.runtime; }
}
```

`RuntimeImpl.callCapability` builds one `CapabilityRequest` and hands it to the WASM host. It
carries no TEE flag, and `HTTPClient.sendRequest` reaches the same line whichever runtime it is
given. So in the TypeScript SDK the `Runtime` / `TeeRuntime` split is a compile-time guardrail, not
a runtime boundary: where a capability call executes is decided by where the binary runs, not by
which object the call is made through. The cast smuggles nothing out of the enclave.

## 4. `ConfidentialHTTPClient` is a different capability

Two distinct capability ids:

- `http-actions@1.0.0-alpha` — `cre.capabilities.HTTPClient`, the one with the `TeeRuntime`
  overload, and the one the template uses inside the enclave.
- `confidential-http@1.0.0-alpha` — `cre.capabilities.ConfidentialHTTPClient`, typed for `Runtime`
  only, with a different request shape: `{ vaultDonSecrets, request: { url, method } }`.

Probe 4 called the second one from inside the handler with the same cast, and it returned `200`. The
template says not to reach for it there. It works in simulation anyway, which is a reason to follow
the template rather than the simulator.

## What this does not prove

- The simulator is not a real TEE, per row V10. These four probes show the SDK compiles and the
  simulator dispatches. They do not show that a real AWS Nitro enclave exposes the `evm` capability.
- Nothing was deployed to a DON. The RPC came from `project.yaml` on the developer's machine, not
  from a DON's configuration.
- `postman-echo.com` is a public HTTPS host. Reaching a relay on localhost is row V13.
