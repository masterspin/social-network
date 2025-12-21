import { SegmentAutofillHighlight, SegmentAutofillSuggestion } from "./types";

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

function safeNavitiaDate(value?: string | null): string | null {
  if (!value) return null;
  const match = value.match(
    /^(?<year>\d{4})(?<month>\d{2})(?<day>\d{2})T(?<hour>\d{2})(?<minute>\d{2})(?<second>\d{2})$/
  );
  if (!match || !match.groups) {
    return safeDate(value);
  }
  const { year, month, day, hour, minute, second } = match.groups;
  const isoString = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
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
): Promise<SegmentAutofillSuggestion | null> {
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

  return {
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
): Promise<SegmentAutofillSuggestion[]> {
  // For MVP, return mock data structure
  // TODO: Integrate AviationStack free tier or FlightAware public data
  const originUpper = origin.trim().toUpperCase();
  const destUpper = destination.trim().toUpperCase();
  const date = dateInput || new Date().toISOString().slice(0, 10);

  // This is placeholder data - in production, fetch from real API
  const suggestions: SegmentAutofillSuggestion[] = [
    {
      type: "flight",
      title: `${originUpper} → ${destUpper}`,
      description: "Direct flight available",
      location_name: originUpper,
      start_time: `${date}T08:00:00Z`,
      end_time: `${date}T12:00:00Z`,
      provider_name: "Various Airlines",
      transport_number: "Flight search result",
      metadata: {
        source: "free-search",
        origin: originUpper,
        destination: destUpper,
      },
      highlights: [
        { label: "Route", value: `${originUpper} → ${destUpper}` },
        { label: "Date", value: date },
      ],
      source: "free-search",
    },
  ];

  return suggestions;
}

export async function fetchTrainSuggestion(
  serviceCodeInput: string,
  dateInput?: string
): Promise<SegmentAutofillSuggestion | null> {
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

  return {
    type: "transport",
    title: line?.name || train?.name || `Service ${serviceCode}`,
    description: companyName || null,
    location_name: firstStop?.stop_point?.name || null,
    start_time: safeNavitiaDate(firstStop?.departure_date_time),
    end_time: safeNavitiaDate(lastStop?.arrival_date_time),
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
): Promise<SegmentAutofillSuggestion | null> {
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

      return {
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

  return {
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
}
