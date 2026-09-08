/** The slice of LiteAPI the supplier agents use. Two implementations: the sandbox, and a fake. */
export interface LiteApiClient {
  /** Hotels matching the public requirements of an auction. */
  searchHotels(query: HotelQuery): Promise<Hotel[]>;
  /** Rates for one hotel. The cheapest matching rate becomes the agent's base price. */
  getRates(hotelId: string, query: HotelQuery): Promise<Rate[]>;
  /** Holds a rate before booking. */
  prebook(rateId: string): Promise<Prebooking>;
  /** Books a held rate with the sandbox payment method. Returns a stable booking id. */
  book(prebookId: string): Promise<Booking>;
}

export interface HotelQuery {
  city: string;
  checkin: string;
  checkout: string;
  numberOfRooms: number;
}

export interface Hotel {
  hotelId: string;
  hotelName: string;
  stars: number;
  distanceKm: number;
}

export interface Rate {
  rateId: string;
  price: number;
  refundable: boolean;
  breakfastIncluded: boolean;
}

export interface Prebooking {
  prebookId: string;
}

export interface Booking {
  bookingId: string;
}
