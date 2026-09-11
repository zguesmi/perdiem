# Evidence: the confidential handler books through a supplier API

Run date: 2026-09-11. Answers
`docs/scratch/verification/issues/14-enclave-books-through-the-supplier-api.md` and row V14 of
`docs/decisions.md`.

A throwaway `hello-confidential-workflows-ts` project, one `handlerInTee`, one cron trigger, five
HTTP calls to the LiteAPI sandbox. CRE CLI v1.32.0, `@chainlink/cre-sdk` 1.18.0. The API key is a
workflow secret and is never logged. The booking is a sandbox record with invented guest data.

## 1. `POST` with a body works inside `handlerInTee`

`cre.capabilities.HTTPClient().sendRequest(runtime, request)` with the `TeeRuntime`, the same
overload row V2 used for `GET`. The request message carries the method and the body already:

```
url: string
method: string
body: Uint8Array
multiHeaders: { [key: string]: { values: string[] } }
timeout?: Duration
cacheSettings?: CacheSettings
```

`node_modules/@chainlink/cre-sdk/dist/generated/capabilities/networking/http/v1alpha/client_pb.d.ts`.
No second capability, no `vaultDonSecrets` shape, no change to the row V2 call site beyond `method`
and `body`.

The handler code:

```ts
const response = http
  .sendRequest(runtime, {
    url: `${config.baseUrl}${path}`,
    method,
    multiHeaders: {
      'X-API-Key': { values: [apiKey] },
      'Content-Type': { values: ['application/json'] },
      Accept: { values: ['application/json'] },
    },
    ...(body === undefined ? {} : { body: encoder.encode(JSON.stringify(body)) }),
  })
  .result()
```

`Date.now()` also works inside the handler, so the timings below are the handler's own.

## 2. The run

```
$ cre workflow simulate v14 --non-interactive --target staging-settings --trigger-index 0 -e .env

2026-09-11T08:21:53Z [USER LOG] [step] search POST status=200 ms=2315
2026-09-11T08:21:53Z [USER LOG] [step] offerId chars=1080
2026-09-11T08:21:55Z [USER LOG] [step] prebook POST status=200 ms=1822
2026-09-11T08:21:55Z [USER LOG] [step] prebookId=M9NWWwgWS
2026-09-11T08:21:58Z [USER LOG] [step] book POST status=200 ms=3513
2026-09-11T08:21:58Z [USER LOG] [step] book bookingId=EeVTi0nPX code=none
2026-09-11T08:21:59Z [USER LOG] [step] book-dupe POST status=400 ms=190
2026-09-11T08:21:59Z [USER LOG] [step] dupe bookingId=undefined code=4005 message=duplicate booking attempt with existing client reference
2026-09-11T08:21:59Z [USER LOG] [step] read-back GET status=200 ms=120
2026-09-11T08:21:59Z [USER LOG] [step] read-back count=1 ids=EeVTi0nPX

✓ Workflow Simulation Result:
"DONE | search POST status=200 ms=2315 bytes=3023 | prebook POST status=200 ms=1822 bytes=2984 | book POST status=200 ms=3513 bytes=4303 | book-dupe POST status=400 ms=190 bytes=92 | read-back GET status=200 ms=120 bytes=3600"

real	0m13.253s
```

## 3. Timings

| Call                                         | Status | ms   | Response bytes |
| -------------------------------------------- | ------ | ---- | -------------- |
| `POST /hotels/rates`                         | 200    | 2315 | 3023           |
| `POST /rates/prebook`                        | 200    | 1822 | 2984           |
| `POST /rates/book`                           | 200    | 3513 | 4303           |
| `POST /rates/book`, the duplicate            | 400    | 190  | 92             |
| `GET /bookings?clientReference=`             | 200    | 120  | 3600           |

7,960 ms of HTTP inside one handler, in a 13.25 s wall run. The per-request timeout is 10 s, so the
book call finished with 2.8x of margin and it is the thinnest point of the chain.

## 4. The duplicate write costs one booking, not three

`clientReference` is set to a value every node computes the same way. The second identical `POST`
creates nothing and returns in 190 ms, and the read-back finds exactly one record:

```
[step] book bookingId=EeVTi0nPX code=none
[step] book-dupe POST status=400 ms=190
[step] dupe code=4005 message=duplicate booking attempt with existing client reference
[step] read-back count=1 ids=EeVTi0nPX
```

So the pattern is: write with a deterministic idempotency key, discard the write's response, then
read the record back and let consensus run over the read. Every node observes the same bytes whether
its own write was the one that landed or not. It also survives a workflow retry and a re-fired cron
tick, which happen whatever the node count is.

This run was a single simulated node. It proves the API deduplicates. It does not prove how a real
Nitro enclave fans a handler out.

## 5. The response-size limit is the trap

The CLI prints its limits and calls them production constraints:

```
✓ Simulation limits enabled
  HTTP: req=120kb resp=250kb timeout=10s | ConfHTTP: req=125kb resp=500kb timeout=1m30s | Consensus obs=25kb | ChainWrite evm_report=50kb evm_gas=10000000 solana_report=265b solana_cu=300000 | WASM binary=100mb compressed=20mb
```

The first search, a plain city search with `limit: 1`, killed the run:

```
✗ workflow execution failed: [8]ResourceExhausted: HTTP response body of 589856 bytes exceeds the simulation limit of 250000 bytes. This limit mirrors a production constraint.
```

One hotel returns roughly 200 offers, and `limit` counts hotels rather than rates. Measured against
the same hotel:

| Search body                            | Response bytes |
| -------------------------------------- | -------------- |
| `cityName` + `countryCode`, `limit: 1` | 589,856        |
| `hotelIds: ["lp1beec"]`                | 592,565        |
| `hotelIds` + `maxRatesPerHotel: 1`     | 3,023          |

`maxRatesPerHotel: 1` is 195x smaller and is what the run above used. Any enclave call to a supplier
API needs the response bounded in the request, because the handler never sees the body it is
rejected for.

## Numbers to carry forward

- `POST` with a body from `handlerInTee`: works, no new capability.
- Three chained supplier calls: 7,650 ms, against a 10 s per-request timeout.
- Duplicate write under a shared idempotency key: refused in 190 ms, one record.
- HTTP response ceiling: 250 KB. Request ceiling 120 KB.
