import type { Policy } from "../../shared/policy.ts";
import type { SealedBidPayload } from "../../shared/sealed-bid.ts";

/**
 * The booking, inside the enclave, against the winner's own API with the credentials sealed in its
 * own envelope. No payout exists without it: the contract refuses a settlement that names a winner
 * and carries no booking id.
 *
 * Nothing here may be logged. The URL, the key and the bid are all the winner's private business,
 * and only the booking id leaves this file.
 *
 * See `docs/adr/0006-the-enclave-books-with-supplier-credentials.md`.
 */

export interface BookingRequest {
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  /** JSON, already encoded. Absent on a `GET`. */
  body?: string;
}

/** One request, answered with the body as text whatever the status. */
export type Send = (request: BookingRequest) => string;

/** The sandbox settles without card details and answers `paymentStatus: "succeeded"`. */
const PAYMENT_METHOD = "ACC_CREDIT_CARD";

/**
 * The Policy prices in USDC and names no nationality, and the supplier API rejects a search that
 * carries neither. Both are fixed for the deployment rather than derived from anything.
 */
const CURRENCY = "USD";
const GUEST_NATIONALITY = "US";

/**
 * The Policy counts rooms, not travellers, and `roomType` is a supplier's free text that scoring
 * deliberately never reads. So occupancy is a constant per room rather than a word match.
 */
const ADULTS_PER_ROOM = 2;

/**
 * The reference marks a holder and a guest required. Nobody in this system supplies one: the buyer
 * states a trip, never a traveller. Invented, and belonging to nobody.
 */
const GUEST = {
  firstName: "Ada",
  lastName: "Tester",
  email: "sandbox.guest@example.com",
  phone: "+15550100",
} as const;

/**
 * The four calls. `""` for a failure at any of them, which is the settlement paying nobody: no
 * winner, no payout, and every stake back. There is no fall-through to the second-best bid.
 */
export function book(
  send: Send,
  payload: SealedBidPayload,
  stay: Policy["hardRequirements"],
  auctionId: `0x${string}`,
): string {
  const call = (path: string, body?: unknown): unknown => {
    const answer = send({
      url: `${payload.bookingUrl}${path}`,
      method: body === undefined ? "GET" : "POST",
      headers: {
        "X-API-Key": payload.bookingApiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    try {
      return JSON.parse(answer);
    } catch {
      return undefined;
    }
  };

  const offerId = find(
    call("/hotels/rates", {
      hotelIds: [payload.bid.hotelId],
      checkin: stay.checkin,
      checkout: stay.checkout,
      currency: CURRENCY,
      guestNationality: GUEST_NATIONALITY,
      occupancies: Array.from({ length: stay.numberOfRooms }, () => ({ adults: ADULTS_PER_ROOM })),
      // Not optional. The same search without it answers 589,856 bytes and kills the run on the
      // HTTP capability's 250 KB response ceiling, which the handler never sees a body for.
      maxRatesPerHotel: 1,
    }),
    "offerId",
  );

  if (offerId === undefined) {
    return "";
  }

  // The search cannot be skipped: only it mints an `offerId`, and one goes stale in minutes, so no
  // bid can carry one either.
  const prebookId = find(call("/rates/prebook", { offerId, usePaymentSdk: false }), "prebookId");

  if (prebookId === undefined) {
    return "";
  }

  // `clientReference` is the auction, which every node derives identically, so the first write
  // lands and any repeat is refused. What the write answered is thrown away on purpose: the id
  // that leaves the enclave comes from the read below, so a retried run and a re-fired cron tick
  // agree on the same bytes.
  call("/rates/book", {
    prebookId,
    clientReference: auctionId,
    payment: { method: PAYMENT_METHOD },
    holder: GUEST,
    guests: [{ occupancyNumber: 1, ...GUEST }],
  });

  return find(call(`/bookings?clientReference=${auctionId}`), "bookingId") ?? "";
}

/**
 * The first string under `key` anywhere in the answer. The three ids this reads sit at three
 * depths, and the search nests its offer under a hotel and a room type, so a path would be three
 * shapes of the supplier's to change and one of them is elided in every example response. An error
 * body carries none of these keys, which is why no status code is read.
 */
function find(value: unknown, key: string): string | undefined {
  if (Array.isArray(value)) {
    for (const element of value) {
      const found = find(element, key);

      if (found !== undefined) {
        return found;
      }
    }
    return undefined;
  }

  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const record = value as Record<string, unknown>;

  if (typeof record[key] === "string" && record[key] !== "") {
    return record[key];
  }

  return find(Object.values(record), key);
}
