import { SegmentAutofillPlan, SegmentAutofillSuggestion } from "@/lib/autofill/types";

const USER_AGENT = "masterspin-itinerary-planner/1.0";

/**
 * Amadeus API Client
 * Free tier: 2,000 API calls/month
 * Handles multi-leg flights automatically
 */

interface AmadeusAuthResponse {
    access_token: string;
    expires_in: number;
    token_type: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAmadeusToken(): Promise<string> {
    const apiKey = process.env.AMADEUS_API_KEY;
    const apiSecret = process.env.AMADEUS_API_SECRET;

    if (!apiKey || !apiSecret) {
        throw new Error("AMADEUS_API_KEY and AMADEUS_API_SECRET are required");
    }

    // Return cached token if still valid
    if (cachedToken && cachedToken.expiresAt > Date.now()) {
        return cachedToken.token;
    }

    // Get new token
    const tokenUrl = "https://test.api.amadeus.com/v1/security/oauth2/token";
    const response = await fetch(tokenUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
            grant_type: "client_credentials",
            client_id: apiKey,
            client_secret: apiSecret,
        }),
    });

    if (!response.ok) {
        throw new Error(`Amadeus auth failed: ${response.status}`);
    }

    const data: AmadeusAuthResponse = await response.json();

    // Cache token (expires in 30 minutes, we'll refresh 5 min early)
    cachedToken = {
        token: data.access_token,
        expiresAt: Date.now() + (data.expires_in - 300) * 1000,
    };

    return data.access_token;
}

export async function fetchFlightOffersAmadeus(
    origin: string,
    destination: string,
    dateInput?: string
): Promise<SegmentAutofillPlan[]> {
    try {
        const token = await getAmadeusToken();
        const originUpper = origin.trim().toUpperCase();
        const destUpper = destination.trim().toUpperCase();
        const date = dateInput || new Date().toISOString().slice(0, 10);

        console.log(`[Amadeus] Searching flights: ${originUpper} → ${destUpper} on ${date}`);

        const url = new URL("https://test.api.amadeus.com/v2/shopping/flight-offers");
        url.searchParams.set("originLocationCode", originUpper);
        url.searchParams.set("destinationLocationCode", destUpper);
        url.searchParams.set("departureDate", date);
        url.searchParams.set("adults", "1");
        url.searchParams.set("max", "5"); // Get top 5 offers
        url.searchParams.set("currencyCode", "USD");

        const response = await fetch(url.toString(), {
            headers: {
                Authorization: `Bearer ${token}`,
                "User-Agent": USER_AGENT,
            },
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => "Unable to read error");
            console.error(`[Amadeus] Request failed (${response.status}): ${errorText}`);
            return [];
        }

        const data = await response.json();
        const offers = data.data || [];

        if (offers.length === 0) {
            console.log(`[Amadeus] No flights found from ${originUpper} to ${destUpper}`);
            return [];
        }

        console.log(`[Amadeus] Found ${offers.length} flight offers`);

        // Convert Amadeus offers to our plan format
        const plans: SegmentAutofillPlan[] = offers.slice(0, 3).map((offer: any, idx: number) => {
            const itinerary = offer.itineraries?.[0]; // First itinerary (outbound)
            const segments = itinerary?.segments || [];
            const price = offer.price?.total;
            const currency = offer.price?.currency || "USD";

            // If single segment (direct flight)
            if (segments.length === 1) {
                const seg = segments[0];
                const departure = seg.departure;
                const arrival = seg.arrival;
                const carrier = seg.carrierCode;
                const flightNumber = `${carrier}${seg.number}`;

                const segment: SegmentAutofillSuggestion = {
                    type: "flight",
                    title: `${flightNumber} · ${originUpper} → ${destUpper}`,
                    description: `Direct flight · ${price ? `${currency} ${price}` : ''}`,
                    location_name: departure.iataCode,
                    start_time: departure.at,
                    end_time: arrival.at,
                    provider_name: carrier,
                    transport_number: flightNumber,
                    metadata: {
                        source: "amadeus",
                        price: price,
                        currency: currency,
                        offer: offer,
                    },
                    highlights: [
                        { label: "Route", value: `${originUpper} → ${destUpper}` },
                        { label: "Flight", value: flightNumber },
                        ...(price ? [{ label: "Price", value: `${currency} ${price}` }] : []),
                    ],
                    source: "Amadeus",
                };

                return {
                    title: "Direct Flight",
                    description: `${carrier} ${flightNumber} · ${price ? `${currency} ${price}` : ''}`,
                    actions: [{ type: "create", segment }],
                };
            }

            // Multi-leg flight
            const legs: SegmentAutofillSuggestion[] = segments.map((seg: any, legIdx: number) => {
                const departure = seg.departure;
                const arrival = seg.arrival;
                const carrier = seg.carrierCode;
                const flightNumber = `${carrier}${seg.number}`;

                return {
                    type: "flight",
                    title: `${flightNumber} · ${departure.iataCode} → ${arrival.iataCode}`,
                    description: `Leg ${legIdx + 1} of ${segments.length}`,
                    location_name: departure.iataCode,
                    start_time: departure.at,
                    end_time: arrival.at,
                    provider_name: carrier,
                    transport_number: flightNumber,
                    metadata: {
                        source: "amadeus",
                        legNumber: legIdx + 1,
                        totalLegs: segments.length,
                    },
                    highlights: [
                        { label: "Route", value: `${departure.iataCode} → ${arrival.iataCode}` },
                        { label: "Flight", value: flightNumber },
                    ],
                    source: "Amadeus",
                };
            });

            const connectionPoints = segments.slice(0, -1).map((s: any) => s.arrival.iataCode).join(", ");

            return {
                title: `${segments.length}-Stop Flight`,
                description: `via ${connectionPoints} · ${price ? `${currency} ${price}` : ''}`,
                actions: legs.map(leg => ({ type: "create" as const, segment: leg })),
            };
        });

        return plans;
    } catch (error) {
        console.error("[Amadeus] Error fetching flight offers:", error);
        return [];
    }
}
