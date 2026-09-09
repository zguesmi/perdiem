# Evidence: the LiteAPI booking id and the sandbox payment method

Run date: 2026-09-09. Answers
`docs/scratch/verification/issues/09-liteapi-booking-id-and-payment-method.md` and row V9 of
`docs/decisions.md`.

The API key, the account's `userId` and the payment transaction ids are redacted. Long opaque blobs
(`offerId`, `rateId`) are elided at the first characters; they are hundreds of characters of base64
and carry no fact.

- Base URL `https://api.liteapi.travel/v3.0`, header `X-API-Key: <redacted>`. Nothing else: no HMAC,
  no signature, no bearer token.
- A sandbox key is a different key, not a different host. Every response carries `"sandbox": true`,
  and the stored booking carries `"sandbox": 1`.
- The trip is the demo trip: Paris, checkin 2026-10-12, checkout 2026-10-14, one room, two adults.
- Guest data is invented. `sandbox.guest@example.com` and `+15550100` belong to nobody.

## 1. Search: `POST /hotels/rates`

```json
{
  "checkin": "2026-10-12",
  "checkout": "2026-10-14",
  "currency": "USD",
  "guestNationality": "US",
  "occupancies": [{ "adults": 2 }],
  "cityName": "Paris",
  "countryCode": "FR",
  "limit": 2
}
```

`200`, two hotels in `hotels[]` and their offers in `data[]`. The four-star hotel `lp1beec`, "Hôtel
Des Grands Voyageurs", returned 200 offers. The one used below is refundable with breakfast, which
is bid C of the demo table:

```json
{
  "offerId": "3gAWonJzkd4AEaRzcmlk…",
  "offerRetailRate": { "amount": 1020.2, "currency": "USD" },
  "paymentTypes": ["NUITEE_PAY"],
  "rates": [
    {
      "rateId": "I5MVUVCNJ5BFOR2FGNDUSTSSKNDTIW…",
      "boardName": "Breakfast Included",
      "cancellationPolicies": { "refundableTag": "RFN" }
    }
  ]
}
```

- Prebook takes the `offerId`, not the `rateId`. The `rateId` is 612 characters and the `offerId`
  1132, both opaque.
- `guestNationality` is required: without it, `400` code `4002`,
  `"guestNationality field invalid or missing"`.
- `cityName` alone is not a search: `400` code `4000`,
  `"you must search by either country code, latitude and longitude, placeId, lastUpdatedAt, IATA code, or hotelIds"`.
- `latitude`, `longitude` and `radius` in metres is an accepted search, and the answer carries each
  hotel's `latitude` and `longitude` but no distance. The agent computes `distanceMeters` itself.
- Nothing in the response is a star rating the Policy can trust. `stars` comes from the hotel
  record, which is row V9's business only insofar as the agent copies it into a self-attested Bid.

## 2. Prebook: `POST /rates/prebook`

```json
{ "offerId": "3gAWonJzkd4AEaRzcmlk…", "usePaymentSdk": false }
```

`200`. The response, trimmed to the fields that matter:

```json
{
  "data": {
    "prebookId": "VjTEvxu9r",
    "offerId": "3gAWonJzkd4AEaRzcmlk…",
    "hotelId": "lp1beec",
    "currency": "USD",
    "price": 1020.2,
    "sellingPriceToUser": 1020.2,
    "commission": 0,
    "priceDifferencePercent": 0,
    "cancellationChanged": false,
    "boardChanged": false,
    "supplier": "nuitee",
    "supplierId": 2,
    "paymentTypes": ["NUITEE_PAY", "ACC_CREDIT_CARD", "WALLET"],
    "checkin": "2026-10-12",
    "checkout": "2026-10-14",
    "roomTypes": [
      {
        "rates": [
          {
            "rateId": "I5MVUVCNJ5BFOR2FGNDUSTSSKNDTIW…",
            "boardType": "BI",
            "boardName": "Breakfast Included",
            "retailRate": { "total": [{ "amount": 1020.2, "currency": "USD" }] },
            "cancellationPolicies": { "refundableTag": "RFN" }
          }
        ]
      }
    ]
  },
  "guestLevel": 0,
  "sandbox": true
}
```

- Prebook has its own id, `data.prebookId`, nine characters. It is not the booking id.
- `data.paymentTypes` is the authoritative list of what the book call will take for this offer:
  `NUITEE_PAY`, `ACC_CREDIT_CARD`, `WALLET`. The search-level `paymentTypes` said `NUITEE_PAY`
  alone.
- An offer goes stale. A prebook of an offer from a search a few minutes earlier failed with `400`
  code `2001`, `"no prebook availability"`. Search again, then prebook.

## 3. Book: `POST /rates/book`

```json
{
  "holder": {
    "firstName": "Ada",
    "lastName": "Tester",
    "email": "sandbox.guest@example.com",
    "phone": "+15550100"
  },
  "payment": { "method": "ACC_CREDIT_CARD" },
  "prebookId": "VjTEvxu9r",
  "guests": [
    {
      "occupancyNumber": 1,
      "firstName": "Ada",
      "lastName": "Tester",
      "email": "sandbox.guest@example.com",
      "remarks": "sandbox test booking"
    }
  ]
}
```

`200`. The response, trimmed:

```json
{
  "data": {
    "bookingId": "Fog_bsZp6",
    "clientReference": "",
    "supplierBookingId": "Fog_bsZp6",
    "supplierBookingName": "nuitee",
    "supplier": "nuitee",
    "supplierId": 2,
    "status": "CONFIRMED",
    "hotelConfirmationCode": "test",
    "checkin": "2026-10-12",
    "checkout": "2026-10-14",
    "hotel": { "hotelId": "lp1beec", "name": "Hôtel Des Grands Voyageurs" },
    "holder": {
      "firstName": "Ada",
      "lastName": "Tester",
      "email": "sandbox.guest@example.com",
      "phone": "+15550100"
    },
    "createdAt": "2026-09-09T11:26:15",
    "updatedAt": "",
    "price": 1020.2,
    "currency": "USD",
    "prebookId": "VjTEvxu9r",
    "paymentStatus": "succeeded",
    "paymentTransactionId": "<redacted>",
    "userId": "<redacted>",
    "hotelId": "lp1beec",
    "hotelName": "Hôtel Des Grands Voyageurs",
    "sandbox": 1,
    "processingFee": 40.8,
    "cancellationPolicies": { "refundableTag": "RFN" }
  },
  "guestLevel": 0,
  "sandbox": true
}
```

- `data.bookingId` is the booking id. Nine characters from the URL-safe base64 alphabet:
  `Fog_bsZp6`, `6WzbwniUp`, `go88cVbfc` across the runs. No fixed prefix, no check digit.
- `data.supplierBookingId` is the same string here, because the sandbox supplier is `nuitee`. It is
  the supplier's field, not LiteAPI's, so it is not the one to hash.
- `hotelConfirmationCode` is the literal `"test"` in the sandbox. Useless as an identifier.
- `payment.method` is `"ACC_CREDIT_CARD"`. The reference calls it sandbox simulation without
  charges, and `paymentStatus` came back `succeeded` with no card details sent.
- `"WALLET"` also returned `200`. An unknown string and an absent `payment` object both fail the
  same way: `400` code `5000`, `"payment failed please check your provided payment information"`. So
  the method is required and the sandbox validates the value.
- The reference marks `holder` and `guests` required. The sandbox does not enforce either: a book
  with `"guests": []` and a book with no `holder` at all both returned `200` and a `CONFIRMED`
  booking. Send both anyway; the sandbox is more permissive than the contract.

## 4. The id is stable, and the response around it is not

`GET /bookings/Fog_bsZp6`, twice, two minutes apart:

```
book response      bookingId=Fog_bsZp6  supplierBookingId=Fog_bsZp6  CONFIRMED  createdAt=2026-09-09T11:26:15
first read         bookingId=Fog_bsZp6  supplierBookingId=Fog_bsZp6  CONFIRMED  createdAt=2026-09-09T11:26:18
second read        bookingId=Fog_bsZp6  supplierBookingId=Fog_bsZp6  CONFIRMED  createdAt=2026-09-09T11:26:18
```

The id does not move. `createdAt` does: the book response says `11:26:15` and both reads say
`11:26:18`. Hash the id, never the response.

`GET /bookings/{bookingId}` is the read path. `GET /bookings` without a query is `400` code `4002`,
`"required guestId or clientReference"`, and `GET /bookings?guestId=0` returns `{"data": []}`.

## 5. The finding that matters: book is not idempotent on the prebook id

One prebook id, `YtZZXsSF2`, booked three times with the same body, each `200`:

```
attempt 1  bookingId=DLlMrnDkw  prebookId=YtZZXsSF2  CONFIRMED  2026-09-09T11:31:20
attempt 2  bookingId=g4HEkH9IQ  prebookId=YtZZXsSF2  CONFIRMED  2026-09-09T11:31:24
attempt 3  bookingId=FKo42x1RC  prebookId=YtZZXsSF2  CONFIRMED  2026-09-09T11:31:27
```

Three bookings, three booking ids, three payment transactions, one prebook. A retried book call
therefore produces a second id, and a Receipt already on chain would name a booking the winner is
not going to honour.

`clientReference` fixes it, and it is the only thing that does. Booking with
`"clientReference": "0x00…01"` returned `bookingId=go88cVbfc`, and the same `clientReference` on a
fresh prebook was refused:

```json
{
  "error": { "code": 4005, "message": "duplicate booking attempt with existing client reference" }
}
```

`GET /bookings?clientReference=0x00…01` then returns exactly the one booking:

```json
{
  "data": [{ "bookingId": "go88cVbfc", "status": "CONFIRMED", "createdAt": "2026-09-09T11:28:06Z" }]
}
```

So the winning agent sets `clientReference` to the `auctionId`. One booking per auction is then
enforced by LiteAPI, and a lost book response is recovered by reading the booking back instead of
booking again.

## 6. What `LiteApiClient` is missing

`agents/src/lite-api/client.ts` cannot carry this answer as it stands:

- `prebook(rateId)` passes the wrong identifier. Prebook takes the offer's `offerId`, and `Rate` has
  no field for it.
- `book(prebookId)` has nowhere to put `payment.method`, `holder`, `guests` or `clientReference`.
  Without `clientReference` the call is not idempotent.
- `Booking` needs `status` and `clientReference` beside `bookingId`, or the agent cannot tell a
  confirmed booking from a repeat.
- `HotelQuery` needs `guestNationality`, `currency` and a `countryCode` beside `city`; `city` alone
  is rejected. `numberOfRooms` maps to the length of `occupancies`.
- `Hotel.distanceKm` is computed, not returned. The Policy measures in metres, so the field should
  be `distanceMeters` and the agent should derive it from the hotel's latitude and longitude.
- A read path is missing: retrieve by booking id, and list by `clientReference`.

## Rejected

- **`supplierBookingId` as the Receipt** — equal to `bookingId` in the sandbox, but it is the
  supplier's identifier and another supplier can shape it differently.
- **`prebookId` as the Receipt** — it names a held offer, not a booking, and one prebook id can
  stand behind several bookings.
- **`hotelConfirmationCode`** — the string `"test"`.
- **`paymentTransactionId`** — a different value on every attempt.
- **Idempotency by prebook id** — the sandbox does not do it, per section 5.

## What this does not prove

- Sandbox only. A production key books real inventory, and `ACC_CREDIT_CARD` there is a real card
  charge rather than a simulation.
- `clientReference` was checked for one repeat. Nothing here says how long the reference is
  remembered.
- Nothing was cancelled. The refund and cancellation endpoints are untouched.
