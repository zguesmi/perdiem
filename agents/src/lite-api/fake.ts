import type { Booking, Hotel, HotelQuery, LiteApiClient, Prebooking, Rate } from "./client.ts";

/**
 * A deterministic stand-in for the LiteAPI sandbox, so that agents and the demo script can run
 * before a sandbox key exists and without a network call in the test suite.
 *
 * It may run the agents. It may never produce the booking evidence: the receipt in the demo comes
 * from a real sandbox booking.
 */
export function createFakeLiteApiClient(): LiteApiClient {
  return {
    searchHotels(_query: HotelQuery): Promise<Hotel[]> {
      throw new Error("createFakeLiteApiClient is not implemented yet.");
    },
    getRates(_hotelId: string, _query: HotelQuery): Promise<Rate[]> {
      throw new Error("createFakeLiteApiClient is not implemented yet.");
    },
    prebook(_rateId: string): Promise<Prebooking> {
      throw new Error("createFakeLiteApiClient is not implemented yet.");
    },
    book(_prebookId: string): Promise<Booking> {
      throw new Error("createFakeLiteApiClient is not implemented yet.");
    },
  };
}
