/**
 * Real hotel identifiers, so that the enclave has something it can actually book. Nothing else
 * about the hotel is scored: the agent self-attests its star level in the bid, and the identifier
 * is the only field an outside system checks.
 */
export interface Hotel {
  hotelId: string;
  hotelName: string;
  stars: number;
}

const LITEAPI_BASE_URL = "https://api.liteapi.travel/v3.0";

/**
 * `GET /data/hotels` is the static catalogue: identifiers, names and star levels, no rates. The
 * rates search is the enclave's business, and it needs a live offer the agent cannot hold.
 */
export async function searchHotels(
  apiKey: string,
  query: { city: string; countryCode: string; limit?: number },
): Promise<Hotel[]> {
  const url = new URL(`${LITEAPI_BASE_URL}/data/hotels`);
  url.searchParams.set("cityName", query.city);
  url.searchParams.set("countryCode", query.countryCode);
  url.searchParams.set("limit", String(query.limit ?? 20));

  const response = await fetch(url, { headers: { "X-API-Key": apiKey } });
  if (!response.ok) {
    throw new Error(`hotel search failed with ${response.status}`);
  }

  const body = (await response.json()) as { data?: { id: string; name: string; stars: number }[] };

  // An entry with no star level cannot be matched against the supplier's own, and the model would
  // pick it blind.
  return (body.data ?? [])
    .filter((hotel) => Number.isInteger(hotel.stars) && hotel.stars > 0)
    .map((hotel) => ({ hotelId: hotel.id, hotelName: hotel.name, stars: hotel.stars }));
}
