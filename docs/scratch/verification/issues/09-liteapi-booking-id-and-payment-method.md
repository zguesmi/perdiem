# Do LiteAPI prebook and book return a stable booking id, and what is the sandbox payment method called?

Status: resolved Type: research

The Receipt is the keccak256 of the booking id, so the id has to be stable between the booking
response and whatever the UI displays beside the on-chain hash.

## Acceptance criteria

- [x] Row V9 is answered with the booking id field name and the sandbox payment method string.
- [x] One prebook and one book response are saved in `docs/scratch/verification/evidence/`, with sandbox test guest data
      only.
- [x] The id is confirmed stable between the booking response and any later read.

## Comments

## Answer

The booking id is `data.bookingId` in the `POST /rates/book` response. Nine characters from the
URL-safe base64 alphabet, no prefix and no check digit: `Fog_bsZp6`, `go88cVbfc`, `DLlMrnDkw` across
the runs. The Receipt hashes that field. `data.supplierBookingId` holds the same string in the
sandbox but belongs to the supplier, and `hotelConfirmationCode` is the literal `"test"`.

Prebook returns its own id, `data.prebookId`, also nine characters, and it is a different value. The
booking record echoes it back as `prebookId`. It is not the Receipt.

The sandbox payment method is `payment.method` set to `"ACC_CREDIT_CARD"`. `paymentStatus` comes
back `succeeded` with no card details sent. `"WALLET"` also returns `200`, and the offer's accepted
list arrives in the prebook response as `data.paymentTypes`. An unknown string and a missing
`payment` object fail the same way: `400` code `5000`,
`"payment failed please check your provided payment information"`.

Guest data: the reference marks `holder` and `guests` required, and the sandbox enforces neither. A
book with `"guests": []` and a book with no `holder` both returned a `CONFIRMED` booking. The agents
send both anyway, with invented data.

The id is stable. Two `GET /bookings/{bookingId}` reads two minutes apart returned the same
`bookingId` and `supplierBookingId`. The response around it is not stable: `createdAt` was
`11:26:15` in the book response and `11:26:18` in both reads.

The risk is elsewhere. `POST /rates/book` is not idempotent on the prebook id: one prebook id booked
three times produced three bookings with three ids. `clientReference` is the idempotency key, and a
repeat is refused with `400` code `4005`,
`"duplicate booking attempt with existing client reference"`. `GET /bookings?clientReference=` then
returns the one booking. So the winning agent sets `clientReference` to the `auctionId`, which makes
one booking per auction and lets a lost book response be read back instead of booked again.

An `offerId` goes stale: a prebook of an offer from a search minutes earlier failed with `400` code
`2001`, `"no prebook availability"`. Search, then prebook, then book, in one go.

`supplier/src/lite-api/client.ts` cannot carry this yet: `prebook` takes a `rateId` where the API
wants the offer's `offerId`, `book` has nowhere for `payment.method`, `holder`, `guests` or
`clientReference`, and there is no read path. The list is in the evidence file. Implementing
`createSandboxLiteApiClient` is a build ticket, not this one.

Evidence: `docs/scratch/verification/evidence/09-liteapi-booking-id-and-payment-method.md`.
