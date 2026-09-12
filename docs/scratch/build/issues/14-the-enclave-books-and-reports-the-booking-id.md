# Book the winner inside the enclave and report the booking id

Status: resolved Type: task Blocked by: 05, 06, 26, 30,
../verification/issues/09-liteapi-booking-id-and-payment-method.md,
../verification/issues/14-enclave-books-through-the-supplier-api.md

The Enclave books the winning bid against the supplier's own API, reads the booking id back, and
puts it in the Settlement. No supplier posts a proof of anything. See
`docs/adr/0006-the-enclave-books-with-supplier-credentials.md`.

Sandbox test guest data only. No real personal data anywhere in this repository.

The four calls, with the `booking` credentials decrypted from the winner's own envelope:

1. `POST {baseUrl}/hotels/rates` with the winner's `hotelId`, the Policy's dates and
   `maxRatesPerHotel: 1`.
2. `POST {baseUrl}/rates/prebook` with the `offerId` from that answer.
3. `POST {baseUrl}/rates/book` with the `prebookId`, `payment.method` `ACC_CREDIT_CARD` and
   `clientReference` set to the `auctionId`.
4. `GET {baseUrl}/bookings?clientReference={auctionId}`, and take `bookingId` from that read.

Step 4 is the point. The booking id that leaves the Enclave comes from a read, never from the
write's own answer, so a repeated run books nothing twice and every node sees the same bytes. Row
V14 measured the whole chain at 7,650 ms against a 10 s per-request timeout.

Two traps, both measured in row V14:

- `maxRatesPerHotel: 1` is not optional. The same search without it returns 589,856 bytes and fails
  the run with `[8]ResourceExhausted` against the HTTP capability's 250 KB ceiling.
- The search cannot be skipped. `prebook` takes an `offerId`, only `POST /hotels/rates` mints one,
  and an `offerId` goes stale in minutes, so the Bid cannot carry one.

## Acceptance criteria

- [x] The Enclave books the winner with the `baseUrl` and `apiKey` from that bid's own envelope.
- [x] `clientReference` is the `auctionId`, and the reported booking id comes from the read-back,
      not from the book response.
- [x] A second identical book is refused with code `4005` and the read-back still returns one
      record. One test states it.
- [x] Every search bounds its response with `maxRatesPerHotel: 1`.
- [x] A failure at any of the four steps returns `winner = address(0)`, `payout = 0` and an empty
      `bookingId`. The Enclave does not fall through to the second-best bid.
- [x] No booking credential and no decrypted bid reaches a log. The evidence run greps clean.
- [x] Sandbox test guest data only. No real personal data anywhere in the repository.

## Comments

`workflow-cre/src/booking.ts` holds the four calls behind one `Send` seam, so the whole chain is
tested against a fake supplier with no network. `workflow.ts` supplies the seam from the HTTP
capability; the enclave passes the Policy's dates and room count, and nothing else about the Policy
reaches the booking.

The ids are read by key rather than by path. The search nests its offer under a hotel and a room
type, and every example response in the evidence elides that container, so a fixed path would be a
guess in three places.

Three values have no source in this system and are constants in that file: the currency and the
guest nationality the search requires, one occupancy per room at two adults, and an invented guest
for the holder the reference marks required.

### The run

`docs/scratch/verification/evidence/simulate-2026-09-12.log`. A local node, the relay, three agents,
one auction, three sealed bids, then `cre workflow simulate`.

- `bids scored=3 dropped decrypt=0 signature=0 commitment=0`.
- The winner's booking at the supplier API: `3fqGeQSKx`, `CONFIRMED`, Hôtel Dame des Arts,
  2026-10-12 to 2026-10-14. Read back by `clientReference`, which is the `auctionId`.
- The log greps clean for the policy, the maximum price, the preferences, the enclave private key,
  any decrypted bid and the booking key.

Five things the run found, all fixed here:

- `scripts/sealed-bidding.ts` never put the sealed policy at the relay, so the enclave had nothing
  to open.
- `z.url()` on `bookingUrl` needs the `URL` global, which the enclave's runtime does not carry.
  Every envelope decrypted and then failed validation, and all three bids dropped in silence.
- The relay read sent no HTTP method: `[3]InvalidArgument: http method cannot be empty`.
- The agent prompt never carried `tradeDownStars`, so the three-star supplier read `minStars: 4` and
  declined to bid at all.
- `lp1beec` has no availability on the policy's dates, so the winner could not be booked. The hotel
  is configuration: that agent now sells `lp51fe7`, and is named after it.

One count became three, by reason, because a silent drop is undebuggable and a reason names no bid.

Not covered by this run: the two reports never reach the chain on a local node. The CRE simulator
calls `0x6e9ee680ef59ef64aa8c7371279c27e496b5edc1`, which holds the mock forwarder on Arc testnet
and nothing at all locally, so both writes are a no-op `eth_call` the workflow reads as success and
the auction stays in `Bidding`. Settlement on chain needs Arc testnet, or that forwarder on the
local node.

## Dev review

Not reviewed yet.
