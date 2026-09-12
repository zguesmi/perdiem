import { test } from "node:test";
import assert from "node:assert/strict";

import { referenceBid } from "../../shared/reference-bid.ts";
import { referencePolicy } from "../../shared/reference-policy.ts";
import type { SealedBidPayload } from "../../shared/sealed-bid.ts";
import { book, type BookingRequest } from "../src/booking.ts";

const AUCTION_ID = `0x${"a1".repeat(32)}` as const;
const BOOKING_URL = "https://api.example.test/v3.0";
const BOOKING_API_KEY = "sand_00000000-0000-0000-0000-000000000000";

const stay = referencePolicy.hardRequirements;

const payload = {
  bid: { ...referenceBid, auctionId: AUCTION_ID },
  salt: `0x${"11".repeat(32)}`,
  signature: `0x${"22".repeat(65)}`,
  bookingUrl: BOOKING_URL,
  bookingApiKey: BOOKING_API_KEY,
} as SealedBidPayload;

/** What the supplier API answers when every call lands. The two ids differ on purpose. */
const answers: Record<string, unknown> = {
  "/hotels/rates": { data: [{ hotelId: referenceBid.hotelId, roomTypes: [{ offerId: "off_1" }] }] },
  "/rates/prebook": { data: { prebookId: "pre_1" } },
  "/rates/book": { data: { bookingId: "from-the-write" } },
  "/bookings": { data: [{ bookingId: "from-the-read", status: "CONFIRMED" }] },
};

/**
 * A supplier API that answers from `bodies`, keyed by the path with its query string dropped, and
 * records every request it was sent.
 */
function supplier(bodies: Record<string, unknown> = answers) {
  const sent: BookingRequest[] = [];

  const send = (request: BookingRequest): string => {
    sent.push(request);
    const path = new URL(request.url).pathname.slice("/v3.0".length);
    const body = bodies[path];

    return body === undefined ? "" : JSON.stringify(body);
  };

  return { sent, send };
}

/** The nth request the supplier was sent, and the JSON body it carried. */
function nth(sent: readonly BookingRequest[], index: number): BookingRequest {
  const request = sent[index];

  assert.ok(request, `no request at ${index}`);
  return request;
}

const bodyOf = (sent: readonly BookingRequest[], index: number): Record<string, unknown> =>
  JSON.parse(nth(sent, index).body ?? "{}");

test("reports the booking id the read-back returns, not the one the write answered", () => {
  const { sent, send } = supplier();

  assert.equal(book(send, payload, stay, AUCTION_ID), "from-the-read");
  assert.deepEqual(
    sent.map((request) => new URL(request.url).pathname),
    ["/v3.0/hotels/rates", "/v3.0/rates/prebook", "/v3.0/rates/book", "/v3.0/bookings"],
  );
});

test("calls the supplier's own API with the credentials sealed in its envelope", () => {
  const { sent, send } = supplier();

  book(send, payload, stay, AUCTION_ID);

  for (const request of sent) {
    assert.ok(request.url.startsWith(BOOKING_URL));
    assert.equal(request.headers["X-API-Key"], BOOKING_API_KEY);
  }
});

test("bounds the search, and searches the dates the policy committed to", () => {
  const { sent, send } = supplier();

  book(send, payload, stay, AUCTION_ID);

  // Without the bound the same search returns 589,856 bytes and the run dies on the HTTP
  // capability's 250 KB response ceiling.
  assert.deepEqual(bodyOf(sent, 0), {
    hotelIds: [referenceBid.hotelId],
    checkin: stay.checkin,
    checkout: stay.checkout,
    currency: "USD",
    guestNationality: "US",
    occupancies: [{ adults: 2 }],
    maxRatesPerHotel: 1,
  });
});

test("carries the offer the search minted into the prebook, and its id into the book", () => {
  const { sent, send } = supplier();

  book(send, payload, stay, AUCTION_ID);

  assert.equal(bodyOf(sent, 1).offerId, "off_1");
  assert.equal(bodyOf(sent, 2).prebookId, "pre_1");
});

test("keys the booking on the auction, so a repeated run books nothing twice", () => {
  const { sent, send } = supplier();

  book(send, payload, stay, AUCTION_ID);

  assert.equal(bodyOf(sent, 2).clientReference, AUCTION_ID);
  assert.match(nth(sent, 3).url, new RegExp(`clientReference=${AUCTION_ID}$`));
});

test("a refused duplicate still reports the one record the read-back finds", () => {
  // The second identical book is refused with code 4005. The write's answer is discarded anyway,
  // so the run settles on the booking that already exists.
  const { send } = supplier({
    ...answers,
    "/rates/book": {
      error: { code: 4005, message: "duplicate booking attempt with existing client reference" },
    },
  });

  assert.equal(book(send, payload, stay, AUCTION_ID), "from-the-read");
});

for (const step of ["/hotels/rates", "/rates/prebook", "/bookings"]) {
  test(`a failure at ${step} books nothing`, () => {
    const { send } = supplier({ ...answers, [step]: { error: { code: 4002 } } });

    assert.equal(book(send, payload, stay, AUCTION_ID), "");
  });
}

test("a body that is not JSON at all books nothing", () => {
  const { send } = supplier({});

  assert.equal(book(send, payload, stay, AUCTION_ID), "");
});

test("asks for one occupancy per room the policy requires", () => {
  const { sent, send } = supplier();

  book(send, payload, { ...stay, numberOfRooms: 3 }, AUCTION_ID);

  assert.equal((bodyOf(sent, 0).occupancies as unknown[]).length, 3);
});
