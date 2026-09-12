# Book the winner inside the enclave and report the booking id

Status: ready-for-agent Type: task Blocked by: 05, 06, 26, 30,
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

- [ ] The Enclave books the winner with the `baseUrl` and `apiKey` from that bid's own envelope.
- [ ] `clientReference` is the `auctionId`, and the reported booking id comes from the read-back,
      not from the book response.
- [ ] A second identical book is refused with code `4005` and the read-back still returns one
      record. One test states it.
- [ ] Every search bounds its response with `maxRatesPerHotel: 1`.
- [ ] A failure at any of the four steps returns `winner = address(0)`, `payout = 0` and an empty
      `bookingId`. The Enclave does not fall through to the second-best bid.
- [ ] No booking credential and no decrypted bid reaches a log. The evidence run greps clean.
- [ ] Sandbox test guest data only. No real personal data anywhere in the repository.

## Comments

## Dev review

Not reviewed yet.
