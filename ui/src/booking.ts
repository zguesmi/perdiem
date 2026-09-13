/** What the enclave booked, read back from the supplier's API by the booking id on chain. */
export type Booking = {
  hotelId: string;
  hotelName: string;
};

/**
 * The booking behind a settlement.
 *
 * The read goes through the page's own origin: the booking API takes a key, and a key in the
 * bundle is a key anyone can spend. See `ui/vite.config.ts`.
 *
 * The price is deliberately not read from here. The chain says what the buyer paid; this answer
 * says what the hotel charged, and the two are different numbers by design.
 */
export async function readBooking(bookingId: string): Promise<Booking | undefined> {
  try {
    const response = await fetch(bookingPath(bookingId));
    if (!response.ok) {
      return undefined;
    }
    const { data } = (await response.json()) as { data?: Partial<Booking> };
    return data?.hotelId && data.hotelName
      ? { hotelId: data.hotelId, hotelName: data.hotelName }
      : undefined;
  } catch {
    return undefined;
  }
}

/** The booking record, as the booking API answers it. */
export function bookingPath(bookingId: string): string {
  return `/booking/${encodeURIComponent(bookingId)}`;
}

/** The hotel record the booking names. */
export function hotelPath(hotelId: string): string {
  return `/hotel?hotelId=${encodeURIComponent(hotelId)}`;
}
