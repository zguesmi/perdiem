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
- [ ] No booking credential and no decrypted bid reaches a log. The evidence run greps clean.
      Nothing logs a credential, and the booking id is public. The simulate run is not recorded:
      both environment files carry a placeholder booking API key.
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

## Dev review

Not reviewed yet.
