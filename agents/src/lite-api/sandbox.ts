import type { Booking, Hotel, HotelQuery, LiteApiClient, Prebooking, Rate } from "./client.ts";

/** The real LiteAPI sandbox: search, then prebook, then book with the sandbox payment method. */
export function createSandboxLiteApiClient(_apiKey: string): LiteApiClient {
  return {
    searchHotels(_query: HotelQuery): Promise<Hotel[]> {
      throw new Error("createSandboxLiteApiClient is not implemented yet.");
    },
    getRates(_hotelId: string, _query: HotelQuery): Promise<Rate[]> {
      throw new Error("createSandboxLiteApiClient is not implemented yet.");
    },
    prebook(_rateId: string): Promise<Prebooking> {
      throw new Error("createSandboxLiteApiClient is not implemented yet.");
    },
    book(_prebookId: string): Promise<Booking> {
      throw new Error("createSandboxLiteApiClient is not implemented yet.");
    },
  };
}
