import {
  SegmentAutofillHighlight,
  SegmentAutofillSuggestion,
  SegmentAutofillPlan,
} from "./types";

const USER_AGENT =
  "segment-smart-fill/1.0 (+https://github.com/ritij/social-network)";

export class ProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderUnavailableError";
  }
}

export class ProviderRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderRequestError";
  }
}

function safeDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function parseCompactDateTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/
  );
  if (!match) {
    return safeDate(value);
  }
  const [, year, month, day, hour, minute, second] = match;
  const isoString = `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
  return safeDate(isoString);
}

function resolveScheduleTime(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "object") {
    const record = value as { local?: string; utc?: string };
    if (typeof record.local === "string" && record.local) {
      return record.local;
    }
    if (typeof record.utc === "string" && record.utc) {
      return record.utc;
    }
  }
  return null;
}

export async function fetchFlightSuggestion(
  flightNumberInput: string,
  dateInput?: string
): Promise<SegmentAutofillPlan | null> {
  const apiKey = process.env.AERODATABOX_API_KEY;
  const apiHost =
    process.env.AERODATABOX_API_HOST ?? "aerodatabox.p.rapidapi.com";
  const apiBase = process.env.AERODATABOX_API_BASE ?? `https://${apiHost}`;

  if (!apiKey) {
    throw new ProviderUnavailableError(
      "Set AERODATABOX_API_KEY to enable flight smart-fill."
    );
  }

  const flightNumber = flightNumberInput.trim().toUpperCase();
  if (!flightNumber) return null;
  const isoDate =
    (dateInput && dateInput.slice(0, 10)) ||
    new Date().toISOString().slice(0, 10);

  const url = new URL(
    `/flights/number/${encodeURIComponent(flightNumber)}/${isoDate}`,
    apiBase
  );
  url.searchParams.set("withLeg", "true");
  url.searchParams.set("withOperationalLeg", "true");
  url.searchParams.set("withLocations", "true");
  url.searchParams.set("withAircraftImage", "false");
  url.searchParams.set("dateLocalRole", "Departure");

  const response = await fetch(url.toString(), {
    headers: {
      "X-RapidAPI-Key": apiKey,
      "X-RapidAPI-Host": apiHost,
      accept: "application/json",
      "user-agent": USER_AGENT,
    },
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    throw new ProviderRequestError(
      `AeroDataBox request failed (${response.status})`
    );
  }

  const payload = await response.json().catch(() => null as unknown);
  const flightCandidate = Array.isArray(payload)
    ? payload[0]
    : Array.isArray(payload?.data)
      ? payload.data[0]
      : payload?.flight || payload?.[0] || null;

  if (!flightCandidate) {
    return null;
  }

  const leg = Array.isArray(flightCandidate?.legs)
    ? flightCandidate.legs[0]
    : flightCandidate?.leg || null;
  const departure = leg?.departure || flightCandidate?.departure || null;
  const arrival = leg?.arrival || flightCandidate?.arrival || null;
  const airline = flightCandidate?.airline || flightCandidate?.airlineInfo;
  const scheduledDeparture =
    resolveScheduleTime(departure?.scheduledTime) ||
    departure?.scheduledTimeLocal ||
    departure?.scheduledTimeUtc;
  const scheduledArrival =
    resolveScheduleTime(arrival?.scheduledTime) ||
    arrival?.scheduledTimeLocal ||
    arrival?.scheduledTimeUtc;

  const departureAirportName =
    departure?.airport?.name || departure?.airportName;
  const arrivalAirportName = arrival?.airport?.name || arrival?.airportName;

  const departureCode =
    departure?.airport?.iata || departure?.airport?.icao || "";
  const arrivalCode = arrival?.airport?.iata || arrival?.airport?.icao || "";

  const departureTerminal =
    departure?.terminal || leg?.departure?.terminal || null;
  const arrivalTerminal = arrival?.terminal || leg?.arrival?.terminal || null;

  const departureTimezone =
    departure?.timezone || departure?.airport?.timeZone || null;
  const arrivalTimezone =
    arrival?.timezone || arrival?.airport?.timeZone || null;

  const departureAddress = [
    departureAirportName,
    departure?.airport?.municipalityName,
    departure?.airport?.countryCode,
  ]
    .filter(Boolean)
    .join(", ");
  const arrivalAddress = [
    arrivalAirportName,
    arrival?.airport?.municipalityName,
    arrival?.airport?.countryCode,
  ]
    .filter(Boolean)
    .join(", ");

  const highlights: SegmentAutofillHighlight[] = [];
  if (departureAirportName && departureCode) {
    highlights.push({
      label: "Departure",
      value: `${departureAirportName} (${departureCode})`,
    });
  }
  if (arrivalAirportName && arrivalCode) {
    highlights.push({
      label: "Arrival",
      value: `${arrivalAirportName} (${arrivalCode})`,
    });
  }
  if (airline?.name) {
    highlights.push({ label: "Airline", value: airline.name });
  }
  if (departureTerminal) {
    highlights.push({ label: "Departure Terminal", value: departureTerminal });
  }
  if (arrivalTerminal) {
    highlights.push({ label: "Arrival Terminal", value: arrivalTerminal });
  }

  const routeLabel = departureAirportName
    ? arrivalAirportName
      ? `${departureAirportName} → ${arrivalAirportName}`
      : departureAirportName
    : arrivalAirportName || "Flight";
  const flightCode =
    flightCandidate?.flight?.iata ||
    flightCandidate?.flight?.icao ||
    flightNumber;

  const suggestion: SegmentAutofillSuggestion = {
    type: "flight",
    title: routeLabel ? `${flightCode} · ${routeLabel}` : flightCode,
    description: airline?.name
      ? `${airline.name} ${flightCandidate?.status || "scheduled"}`
      : flightCandidate?.status || undefined,
    location_name:
      departureAirportName || arrivalAirportName || "Flight segment",
    start_time: safeDate(scheduledDeparture),
    end_time: safeDate(scheduledArrival),
    provider_name: airline?.name || null,
    confirmation_code: null,
    transport_number:
      flightCandidate?.flight?.iata ||
      flightCandidate?.flight?.icao ||
      flightNumber,
    timezone: departureTimezone || arrivalTimezone || null,
    location_address:
      departureAddress ||
      arrivalAddress ||
      departureAirportName ||
      arrivalAirportName ||
      null,
    location_lat: departure?.airport?.location?.lat || null,
    location_lng: departure?.airport?.location?.lon || null,
    metadata: {
      source: "aerodatabox",
      airline,
      departure,
      arrival,
      leg,
    },
    highlights: highlights.length ? highlights : null,
    source: "aerodatabox",
  };

  return {
    title: suggestion.title || "Flight",
    description: suggestion.description || undefined,
    actions: [{ type: "create", segment: suggestion }],
  };
}

/**
 * Free flight data fetcher using public aviation APIs
 * Note: This is a simplified version for demo purposes
 * For production, consider AviationStack free tier (100 req/month)
 */
export async function fetchFlightSuggestionFree(
  origin: string,
  destination: string,
  dateInput?: string
): Promise<SegmentAutofillPlan[]> {
  const apiKey = process.env.AERODATABOX_API_KEY;
  const apiHost = process.env.AERODATABOX_API_HOST ?? "aerodatabox.p.rapidapi.com";
  const apiBase = process.env.AERODATABOX_API_BASE ?? `https://${apiHost}`;

  if (!apiKey) {
    console.warn("AERODATABOX_API_KEY not set, returning mock data");
    return getMockFlightPlans(origin, destination, dateInput);
  }

  const originUpper = origin.trim().toUpperCase();
  const destUpper = destination.trim().toUpperCase();
  const date = dateInput || new Date().toISOString().slice(0, 10);

  try {
    // Query departures from origin airport
    const url = new URL(
      `/flights/airports/iata/${originUpper}/${date}T00:00/${date}T23:59`,
      apiBase
    );
    url.searchParams.set("withLeg", "true");
    url.searchParams.set("withCancelled", "false");
    url.searchParams.set("withCodeshared", "true");
    url.searchParams.set("withCargo", "false");
    url.searchParams.set("withPrivate", "false");
    url.searchParams.set("withLocation", "true");
    url.searchParams.set("direction", "Departure");

    const response = await fetch(url.toString(), {
      headers: {
        "X-RapidAPI-Key": apiKey,
        "X-RapidAPI-Host": apiHost,
        accept: "application/json",
        "user-agent": USER_AGENT,
      },
      next: { revalidate: 3600 }, // Cache for 1 hour
    });

    if (!response.ok) {
      console.warn(`AeroDataBox request failed (${response.status}), using mock data`);
      return getMockFlightPlans(origin, destination, dateInput);
    }

    const payload = await response.json().catch(() => null);
    const departures = Array.isArray(payload?.departures) ? payload.departures : [];

    // Filter flights going to destination
    const matchingFlights = departures.filter((flight: any) => {
      const arrivalIata = flight?.arrival?.airport?.iata || flight?.movement?.airport?.iata;
      return arrivalIata === destUpper;
    });

    if (matchingFlights.length === 0) {
      console.log(`No direct flights found from ${originUpper} to ${destUpper}, returning mock data`);
      return getMockFlightPlans(origin, destination, dateInput);
    }

    // Convert to plans (limit to 3 options)
    const plans: SegmentAutofillPlan[] = matchingFlights.slice(0, 3).map((flight: any, idx: number) => {
      const departure = flight?.departure || {};
      const arrival = flight?.arrival || {};
      const airline = flight?.airline || {};

      const flightNumber = `${airline?.iata || airline?.icao || ''}${flight?.number || ''}`.trim();
      const departureTime = departure?.scheduledTimeLocal || departure?.scheduledTimeUtc;
      const arrivalTime = arrival?.scheduledTimeLocal || arrival?.scheduledTimeUtc;

      const segment: SegmentAutofillSuggestion = {
        type: "flight",
        title: `${flightNumber} · ${originUpper} → ${destUpper}`,
        description: `${airline?.name || 'Flight'}`,
        location_name: departure?.airport?.name || originUpper,
        start_time: departureTime ? safeDate(departureTime) : null,
        end_time: arrivalTime ? safeDate(arrivalTime) : null,
        provider_name: airline?.name || null,
        transport_number: flightNumber || null,
        metadata: {
          source: "aerodatabox-route-search",
          origin: originUpper,
          destination: destUpper,
          departure: departure,
          arrival: arrival,
        },
        highlights: [
          { label: "Route", value: `${originUpper} → ${destUpper}` },
          { label: "Flight", value: flightNumber },
        ],
        source: "AeroDataBox",
      };

      return {
        title: idx === 0 ? "Direct Flight" : `Option ${idx + 1}`,
        description: `${airline?.name || 'Flight'} ${flightNumber}`,
        actions: [{ type: "create", segment }],
      };
    });

    return plans;
  } catch (error) {
    console.error("Error fetching flights from AeroDataBox:", error);
    return getMockFlightPlans(origin, destination, dateInput);
  }
}

// Fallback mock data function
function getMockFlightPlans(
  origin: string,
  destination: string,
  dateInput?: string
): SegmentAutofillPlan[] {
  const originUpper = origin.trim().toUpperCase();
  const destUpper = destination.trim().toUpperCase();
  const date = dateInput || new Date().toISOString().slice(0, 10);

  const directSuggestion: SegmentAutofillSuggestion = {
    type: "flight",
    title: `${originUpper} → ${destUpper} (Direct)`,
    description: "Direct flight · 4h 30m",
    location_name: originUpper,
    start_time: `${date}T08:00:00`,
    end_time: `${date}T12:30:00`,
    provider_name: "Mock Airlines",
    transport_number: "MA101",
    metadata: {
      source: "mock-data",
      origin: originUpper,
      destination: destUpper,
    },
    highlights: [
      { label: "Route", value: `${originUpper} → ${destUpper}` },
      { label: "Type", value: "Direct" },
    ],
    source: "mock-data",
  };

  const leg1: SegmentAutofillSuggestion = {
    type: "flight",
    title: `${originUpper} → HUB`,
    description: "Leg 1 · 2h 00m",
    location_name: originUpper,
    start_time: `${date}T07:00:00`,
    end_time: `${date}T09:00:00`,
    provider_name: "Mock Express",
    transport_number: "ME55",
    metadata: { source: "mock-data" },
    highlights: [{ label: "Route", value: `${originUpper} → HUB` }],
    source: "mock-data",
  };

  const leg2: SegmentAutofillSuggestion = {
    type: "flight",
    title: `HUB → ${destUpper}`,
    description: "Leg 2 · 3h 00m",
    location_name: "HUB",
    start_time: `${date}T10:30:00`,
    end_time: `${date}T13:30:00`,
    provider_name: "Mock Express",
    transport_number: "ME56",
    metadata: { source: "mock-data" },
    highlights: [{ label: "Route", value: `HUB → ${destUpper}` }],
    source: "mock-data",
  };

  return [
    {
      title: "Direct Flight",
      description: "Fastest option",
      actions: [{ type: "create", segment: directSuggestion }],
    },
    {
      title: "Connection via HUB",
      description: "Cheaper option · 2 Segments",
      actions: [
        { type: "create", segment: leg1 },
        { type: "create", segment: leg2 },
      ],
    },
  ];
}

export async function fetchTrainSuggestion(
  serviceCodeInput: string,
  dateInput?: string
): Promise<SegmentAutofillPlan | null> {
  const apiToken = process.env.NAVITIA_API_TOKEN;
  const coverage = process.env.NAVITIA_COVERAGE ?? "sncf";

  if (!apiToken) {
    throw new ProviderUnavailableError(
      "Set NAVITIA_API_TOKEN to enable train smart-fill."
    );
  }

  const serviceCode = serviceCodeInput.trim();
  if (!serviceCode) return null;
  const url = new URL(
    `/v1/coverage/${coverage}/vehicle_journeys`,
    "https://api.navitia.io"
  );
  url.searchParams.set("show_codes", "true");
  url.searchParams.set("disable_geojson", "true");
  url.searchParams.set("count", "1");
  url.searchParams.set("filter", `vehicle_journeys.code="${serviceCode}"`);

  if (dateInput) {
    const isoDate = dateInput.slice(0, 10);
    const compact = isoDate.replace(/-/g, "");
    if (compact.length === 8) {
      url.searchParams.set("datetime", `${compact}T000000`);
    }
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Basic ${Buffer.from(`${apiToken}:`).toString("base64")}`,
      accept: "application/json",
      "user-agent": USER_AGENT,
    },
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    throw new ProviderRequestError(
      `Navitia request failed (${response.status})`
    );
  }

  const payload = await response.json().catch(() => null as unknown);
  const train = payload?.vehicle_journeys?.[0];
  if (!train) {
    return null;
  }

  const stopTimes = train.stop_times ?? [];
  const firstStop = stopTimes[0];
  const lastStop = stopTimes[stopTimes.length - 1];
  const line = train?.line;
  const companyName = train?.companies?.[0]?.name || line?.transport_mode_name;

  const highlights: SegmentAutofillHighlight[] = [];
  if (firstStop?.stop_point?.name) {
    highlights.push({
      label: "Depart",
      value: firstStop.stop_point.name,
    });
  }
  if (lastStop?.stop_point?.name) {
    highlights.push({
      label: "Arrive",
      value: lastStop.stop_point.name,
    });
  }
  if (line?.name) {
    highlights.push({ label: "Line", value: line.name });
  }

  const suggestion: SegmentAutofillSuggestion = {
    type: "transport",
    title: line?.name || train?.name || `Service ${serviceCode}`,
    description: companyName || null,
    location_name: firstStop?.stop_point?.name || null,
    start_time: parseCompactDateTime(firstStop?.departure_date_time),
    end_time: parseCompactDateTime(lastStop?.arrival_date_time),
    provider_name: companyName || null,
    transport_number: serviceCode,
    location_address: firstStop?.stop_point?.name || null,
    metadata: {
      source: "navitia",
      line,
      stop_times: stopTimes,
    },
    highlights: highlights.length ? highlights : null,
    source: "navitia",
  };

  return {
    title: suggestion.title || "Train Journey",
    description: suggestion.description || undefined,
    actions: [{ type: "create", segment: suggestion }],
  };
}

type PlaceSuggestionParams = {
  query: string;
  type: "hotel" | "meal" | "activity";
  context?: {
    lat?: number;
    lng?: number;
    radiusMeters?: number;
  } | null;
};

const FOURSQUARE_CATEGORIES: Record<string, string> = {
  hotel: "19014",
  meal: "13065,13034,13383",
  activity: "10000,11000",
};

const ensureNumber = (value?: number | string | null): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export async function fetchPlaceSuggestion(
  params: PlaceSuggestionParams
): Promise<SegmentAutofillPlan | null> {
  const { query, type, context } = params;
  const trimmed = query.trim();
  if (!trimmed) return null;

  const fsqKey = process.env.FOURSQUARE_API_KEY;
  if (fsqKey) {
    const url = new URL("https://api.foursquare.com/v3/places/search");
    url.searchParams.set("query", trimmed);
    url.searchParams.set("limit", "5");
    url.searchParams.set("sort", "POPULARITY");
    const categories = FOURSQUARE_CATEGORIES[type];
    if (categories) {
      url.searchParams.set("categories", categories);
    }
    if (context?.lat && context?.lng) {
      url.searchParams.set("ll", `${context.lat},${context.lng}`);
      if (context.radiusMeters) {
        url.searchParams.set("radius", `${context.radiusMeters}`);
      }
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: fsqKey,
        accept: "application/json",
        "user-agent": USER_AGENT,
      },
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      throw new ProviderRequestError(
        `Foursquare Places request failed (${response.status})`
      );
    }

    const payload = await response.json().catch(() => null as unknown);
    const place = payload?.results?.[0];
    if (place) {
      const address =
        place.location?.formatted_address ||
        [
          place.location?.address,
          place.location?.locality,
          place.location?.region,
          place.location?.country,
        ]
          .filter(Boolean)
          .join(", ");

      const highlights: SegmentAutofillHighlight[] = [];
      if (place.rating) {
        highlights.push({
          label: "Rating",
          value: `${place.rating}/10`,
        });
      }
      if (place.hours?.display?.length) {
        highlights.push({
          label: "Hours",
          value: place.hours.display[0],
        });
      }

      const suggestion: SegmentAutofillSuggestion = {
        type,
        title: place.name,
        description: place.categories?.[0]?.name || null,
        location_name: place.name,
        location_address: address || null,
        location_lat: ensureNumber(place.location?.lat),
        location_lng: ensureNumber(place.location?.lng),
        provider_name: place.categories?.[0]?.name || null,
        metadata: {
          source: "foursquare",
          place_id: place.fsq_id,
          hours: place.hours,
          link: place.website || place.link,
        },
        highlights: highlights.length ? highlights : null,
        source: "foursquare",
      };

      return {
        title: suggestion.title || "Place",
        description: suggestion.description || undefined,
        actions: [{ type: "create", segment: suggestion }],
      };
    }
  }

  // Open fallback using Nominatim (no API key required)
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("extratags", "1");
  url.searchParams.set("q", trimmed);
  if (context?.lat && context?.lng) {
    const radius = context.radiusMeters ?? 10000;
    const lonDiff =
      radius / (111.32 * 1000 * Math.cos((context.lat * Math.PI) / 180));
    const latDiff = radius / (111.32 * 1000);
    url.searchParams.set(
      "viewbox",
      [
        context.lng - lonDiff,
        context.lat + latDiff,
        context.lng + lonDiff,
        context.lat - latDiff,
      ].join(",")
    );
    url.searchParams.set("bounded", "1");
  }

  const response = await fetch(url.toString(), {
    headers: { "user-agent": USER_AGENT },
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    throw new ProviderRequestError(
      `Nominatim request failed (${response.status})`
    );
  }

  const payload = await response.json().catch(() => null as unknown);
  const place = Array.isArray(payload) ? payload[0] : null;
  if (!place) return null;

  const address = place.display_name;
  const openingHours = place.extratags?.opening_hours;

  const highlights: SegmentAutofillHighlight[] = [];
  if (openingHours) {
    highlights.push({ label: "Hours", value: openingHours });
  }

  const suggestion: SegmentAutofillSuggestion = {
    type,
    title: place.name || place.display_name || trimmed,
    description: place.type || null,
    location_name: place.display_name || trimmed,
    location_address: address || null,
    location_lat: ensureNumber(place.lat),
    location_lng: ensureNumber(place.lon),
    provider_name: place.extratags?.brand || null,
    metadata: {
      source: "nominatim",
      osm_type: place.osm_type,
      osm_id: place.osm_id,
      extratags: place.extratags,
    },
    highlights: highlights.length ? highlights : null,
    source: "nominatim",
  };

  return {
    title: suggestion.title || "Place",
    description: suggestion.description || undefined,
    actions: [{ type: "create", segment: suggestion }],
  };
}

type RideSuggestionParams = {
  origin: string;
  destination: string;
  time?: string;
  context?: {
    lat?: number;
    lng?: number;
  } | null;
};

export async function fetchRideSuggestion(
  params: RideSuggestionParams
): Promise<SegmentAutofillPlan | null> {
  const { origin, destination, time, context } = params;

  // Helper to search places
  const searchPlace = async (query: string) => {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    url.searchParams.set("q", query);
    url.searchParams.set("addressdetails", "1");

    const res = await fetch(url.toString(), {
      headers: { "user-agent": USER_AGENT },
      next: { revalidate: 3600 } // Cache for 1 hour
    });
    const payload = await res.json().catch(() => []);
    return payload?.[0] || null;
  };

  const [originPlace, destPlace] = await Promise.all([
    searchPlace(origin),
    searchPlace(destination)
  ]);

  if (!originPlace && !destPlace) return null;

  const originLabel = originPlace?.name || originPlace?.display_name?.split(',')[0] || origin;
  const destLabel = destPlace?.name || destPlace?.display_name?.split(',')[0] || destination;

  const highlights: SegmentAutofillHighlight[] = [];
  if (originPlace) {
    highlights.push({ label: "Pickup", value: originLabel });
  }
  if (destPlace) {
    highlights.push({ label: "Dropoff", value: destLabel });
  }

  // Construct a useful title
  const title = `Ride: ${originLabel} → ${destLabel}`;

  const suggestion: SegmentAutofillSuggestion = {
    type: "transport",
    title: title,
    description: "Car Request",
    location_name: originLabel, // Pickup location
    location_address: originPlace?.display_name || null,
    location_lat: ensureNumber(originPlace?.lat),
    location_lng: ensureNumber(originPlace?.lon),
    start_time: safeDate(time), // Suggested start time

    // We can't know the end time without routing, but we can default provider
    provider_name: "Uber",
    transport_number: null,

    metadata: {
      source: "nominatim-ride",
      origin_place: originPlace,
      destination_place: destPlace,
      destination_address: destPlace?.display_name || null,
    },
    highlights: highlights.length ? highlights : null,
    source: "nominatim",
  };

  return {
    title: suggestion.title || "Ride Request",
    description: "Car / Taxi Service",
    actions: [{ type: "create", segment: suggestion }],
  };
}
