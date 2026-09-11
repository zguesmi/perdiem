# Can the confidential handler book through a supplier API, and how long does the chain take?

Status: resolved Type: research Blocked by: 02, 09

The booking proof is worth nothing while the winner mints it. `submitReceipt` takes any `bytes32`
from the winner, and the contract checks none of it, so a winner frees its stake with
`keccak256("anything")`. Moving the proof into the settlement report replaces the winner with the
same oracle the payout already trusts.

That only works if the enclave can make the booking call itself. Three things have to hold, and
every one of them is unverified against rows V2 and V13, which are `GET` only:

- `HTTPClient.sendRequest` takes a method and a body from inside `handlerInTee`.
- A supplier chain of search, prebook and book fits the handler's time budget.
- A write that N nodes may each send produces one booking, not N.

## Acceptance criteria

- [x] Row V14 records whether `POST` with a body works inside `handlerInTee`, and through which
      capability.
- [x] It records the measured time of three chained supplier calls and the per-request timeout they
      run against.
- [x] It records whether a deterministic idempotency key collapses duplicate writes, with the
      observed refusal.
- [x] One full simulation run lands in `docs/evidence/`, with no API key and no guest data beyond
      the invented sandbox values.

## Answer

All three hold.

`POST` with a body is the same call as row V2's `GET`: `cre.capabilities.HTTPClient().sendRequest`
with the `TeeRuntime`. The request message already carries `method: string` and `body: Uint8Array`
beside `url` and `multiHeaders`. No second capability and no new overload. `Date.now()` works inside
the handler, so the handler can time itself.

The chain took 7,650 ms for search, prebook and book: 2,315 ms, 1,822 ms and 3,513 ms. The
per-request timeout is 10 s, printed by the CLI as a production constraint. The book call is the
thinnest point, at 2.8x of margin on a sandbox that is faster than production. Whether a run carries
an overall deadline on top of the per-request one is not printed and stays unknown.

Duplicate writes collapse on `clientReference`. The second identical `POST /rates/book` returned
`400` code `4005`, `"duplicate booking attempt with existing client reference"`, in 190 ms, and
`GET /bookings?clientReference=` then returned exactly one record. So the handler writes with a key
every node derives the same way, throws the write's response away, reads the record back, and lets
consensus run over the read. That also covers a workflow retry and a re-fired cron tick, which do
not depend on the node count. The run was one simulated node, so it proves the API deduplicates and
proves nothing about how a real Nitro enclave fans a handler out.

The limit that bites is the response size, not the time. The HTTP capability caps a response at 250
KB and a request at 120 KB. A plain city search returned 589,856 bytes and failed the run with
`[8]ResourceExhausted`, because one hotel carries about 200 offers and `limit` counts hotels.
`maxRatesPerHotel: 1` brings the same search to 3,023 bytes. An enclave call to a supplier API has
to bound the response in the request.

Evidence:
[14 — The confidential handler books through a supplier API](../../../evidence/14-enclave-books-through-the-supplier-api.md).

## Comments
