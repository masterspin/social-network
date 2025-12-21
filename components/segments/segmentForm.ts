import type {
  SegmentAutofillSuggestion,
  SegmentAutofillType,
} from "@/lib/autofill/types";

export const SEGMENT_TYPES = ["flight"] as const;

export type SegmentType = (typeof SEGMENT_TYPES)[number];

export type SegmentLegForm = {
  id: string;
  origin: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
  carrier: string;
  number: string;
  seat: string;
};

export type SegmentFormState = {
  type: SegmentType;
  title: string;
  description: string;
  locationName: string;
  locationAddress: string;
  locationLat: string;
  locationLng: string;
  startTime: string;
  endTime: string;
  timezone: string;
  isAllDay: boolean;
  providerName: string;
  confirmationCode: string;
  transportNumber: string;
  seatInfo: string;
  costAmount: string;
  legs: SegmentLegForm[];
  metadata: Record<string, unknown>;
};

export type SegmentTypeConfig = {
  key: SegmentType;
  label: string;
  smartFillHint: string;
  titlePlaceholder: string;
  descriptionPlaceholder: string;
  locationLabel: string;
  locationPlaceholder: string;
  providerLabel: string;
  providerPlaceholder: string;
  confirmationLabel: string;
  confirmationPlaceholder: string;
  referenceLabel?: string;
  referencePlaceholder?: string;
  showSeatInput?: boolean;
  seatLabel?: string;
  seatPlaceholder?: string;
};

export const SEGMENT_TYPE_CONFIG: Record<SegmentType, SegmentTypeConfig> = {
  flight: {
    key: "flight",
    label: "Flight",
    smartFillHint: "Flight number · e.g., UA 120",
    titlePlaceholder: "UA120 · SFO → NRT",
    descriptionPlaceholder: "Cabin, seat, baggage, or lounge notes",
    locationLabel: "Primary airport / terminal",
    locationPlaceholder: "San Francisco Intl · Terminal G",
    providerLabel: "Airline",
    providerPlaceholder: "United Airlines",
    confirmationLabel: "Confirmation",
    confirmationPlaceholder: "ABC123",
    referenceLabel: "Flight number",
    referencePlaceholder: "UA 120",
    showSeatInput: true,
    seatLabel: "Seat / Cabin",
    seatPlaceholder: "12A · Polaris",
  },
};

export type SegmentTypeOption = {
  value: SegmentType;
  label: string;
};

export const SEGMENT_TYPE_OPTIONS: SegmentTypeOption[] = SEGMENT_TYPES.map(
  (segmentType) => ({
    value: segmentType,
    label: SEGMENT_TYPE_CONFIG[segmentType].label,
  })
);

export const SMART_FILL_SUPPORTED_TYPES = new Set<SegmentType>(["flight"]);

export function normalizeSegmentType(
  _: string | null | undefined
): SegmentType {
  return "flight";
}

export function getTypeConfig(value?: string | null): SegmentTypeConfig {
  return SEGMENT_TYPE_CONFIG[normalizeSegmentType(value)];
}

export function supportsLegsForType(_: SegmentType): boolean {
  return false;
}

export function toAutofillType(_: SegmentType): SegmentAutofillType {
  return "flight";
}

export function createLegId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function normalizeLegTimeInput(value?: string | null): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    return value;
  }
  return isoToLocalInput(value) || value;
}

export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toISOString();
}

export function createEmptyLeg(seed?: Partial<SegmentLegForm>): SegmentLegForm {
  return {
    id: createLegId(),
    origin: seed?.origin ?? "",
    destination: seed?.destination ?? "",
    departureTime: seed?.departureTime ?? "",
    arrivalTime: seed?.arrivalTime ?? "",
    carrier: seed?.carrier ?? "",
    number: seed?.number ?? "",
    seat: seed?.seat ?? "",
  };
}

export function parseLegsFromMetadata(
  metadata?: Record<string, unknown> | null
): SegmentLegForm[] {
  if (!metadata || typeof metadata !== "object") return [];
  const rawLegs = (metadata as Record<string, unknown>).legs;
  if (!Array.isArray(rawLegs)) return [];
  return rawLegs
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      const departureRaw =
        (record.departure_time as string | undefined) ??
        (record.departureTime as string | undefined);
      const arrivalRaw =
        (record.arrival_time as string | undefined) ??
        (record.arrivalTime as string | undefined);
      return createEmptyLeg({
        origin: typeof record.origin === "string" ? record.origin : "",
        destination:
          typeof record.destination === "string" ? record.destination : "",
        departureTime: normalizeLegTimeInput(departureRaw ?? null),
        arrivalTime: normalizeLegTimeInput(arrivalRaw ?? null),
        carrier: typeof record.carrier === "string" ? record.carrier : "",
        number: typeof record.number === "string" ? record.number : "",
        seat: typeof record.seat === "string" ? record.seat : "",
      });
    })
    .filter((leg): leg is SegmentLegForm => Boolean(leg));
}

export function serializeLegs(
  legs: SegmentLegForm[]
): Array<Record<string, string | null>> | undefined {
  const serialized = legs
    .map((leg) => {
      const origin = leg.origin.trim();
      const destination = leg.destination.trim();
      const departure_time = localInputToIso(leg.departureTime);
      const arrival_time = localInputToIso(leg.arrivalTime);
      const carrier = leg.carrier.trim();
      const number = leg.number.trim();
      const seat = leg.seat.trim();
      const hasValue =
        origin ||
        destination ||
        departure_time ||
        arrival_time ||
        carrier ||
        number ||
        seat;
      if (!hasValue) return null;
      return {
        origin: origin || null,
        destination: destination || null,
        departure_time: departure_time,
        arrival_time: arrival_time,
        carrier: carrier || null,
        number: number || null,
        seat: seat || null,
      };
    })
    .filter((entry): entry is Record<string, string | null> => Boolean(entry));
  return serialized.length ? serialized : undefined;
}

export function parseUsdCostInput(value: string): number | null {
  if (!value) return null;
  const normalized = value
    .replace(/[^0-9.,-]/g, "")
    .replace(/,/g, "")
    .trim();
  if (!normalized) return null;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractLegsFromSuggestion(
  suggestion: SegmentAutofillSuggestion
): SegmentLegForm[] | null {
  const metadata = suggestion.metadata;
  if (!metadata || typeof metadata !== "object") return null;
  if (Array.isArray((metadata as Record<string, unknown>).legs)) {
    return parseLegsFromMetadata(metadata as Record<string, unknown>);
  }

  const cast = metadata as Record<string, unknown>;
  const legCandidate = cast.leg || cast.legs;
  if (legCandidate && typeof legCandidate === "object") {
    const entries = Array.isArray(legCandidate) ? legCandidate : [legCandidate];
    const legs = entries
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const record = entry as Record<string, unknown>;
        const departure = record.departure as Record<string, unknown>;
        const arrival = record.arrival as Record<string, unknown>;
        const departureTime =
          (departure?.scheduledTimeLocal as string | undefined) ??
          (departure?.scheduledTimeUtc as string | undefined);
        const arrivalTime =
          (arrival?.scheduledTimeLocal as string | undefined) ??
          (arrival?.scheduledTimeUtc as string | undefined);
        const departureAirport = departure?.airport as Record<string, unknown>;
        const arrivalAirport = arrival?.airport as Record<string, unknown>;
        const originName =
          (departureAirport?.name as string | undefined) ??
          (departure?.airportName as string | undefined) ??
          "";
        const destinationName =
          (arrivalAirport?.name as string | undefined) ??
          (arrival?.airportName as string | undefined) ??
          "";
        return createEmptyLeg({
          origin: originName,
          destination: destinationName,
          departureTime: normalizeLegTimeInput(departureTime ?? null),
          arrivalTime: normalizeLegTimeInput(arrivalTime ?? null),
          carrier:
            typeof suggestion.provider_name === "string"
              ? suggestion.provider_name
              : "",
          number:
            typeof suggestion.transport_number === "string"
              ? suggestion.transport_number
              : "",
        });
      })
      .filter((leg): leg is SegmentLegForm => Boolean(leg));
    if (legs.length) return legs;
  }

  if (Array.isArray(cast.stop_times)) {
    const stops = cast.stop_times as Record<string, unknown>[];
    if (stops.length >= 2) {
      const legs = [] as SegmentLegForm[];
      for (let i = 0; i < stops.length - 1; i += 1) {
        const current = stops[i];
        const next = stops[i + 1];
        const currentStop = current?.stop_point as Record<string, unknown>;
        const nextStop = next?.stop_point as Record<string, unknown>;
        legs.push(
          createEmptyLeg({
            origin:
              (currentStop?.name as string | undefined) ??
              (current?.name as string | undefined) ??
              "",
            destination:
              (nextStop?.name as string | undefined) ??
              (next?.name as string | undefined) ??
              "",
            departureTime: normalizeLegTimeInput(
              (current?.departure_date_time as string | undefined) ?? null
            ),
            arrivalTime: normalizeLegTimeInput(
              (next?.arrival_date_time as string | undefined) ?? null
            ),
            carrier:
              typeof suggestion.provider_name === "string"
                ? suggestion.provider_name
                : "",
            number:
              typeof suggestion.transport_number === "string"
                ? suggestion.transport_number
                : "",
          })
        );
      }
      if (legs.length) return legs;
    }
  }

  return null;
}

export function buildMetadataPayload(
  form: SegmentFormState
): Record<string, unknown> | null {
  const base = { ...form.metadata };
  const serializedLegs = supportsLegsForType(form.type)
    ? serializeLegs(form.legs)
    : undefined;
  if (serializedLegs) {
    base.legs = serializedLegs;
  } else {
    delete base.legs;
  }
  return Object.keys(base).length ? base : null;
}

export function isoToLocalInput(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const tzOffset = date.getTimezoneOffset() * 60000;
  const local = new Date(date.getTime() - tzOffset);
  return local.toISOString().slice(0, 16);
}

export function mergeSmartSuggestion(
  current: SegmentFormState,
  suggestion: SegmentAutofillSuggestion
): SegmentFormState {
  const mergedMetadata: Record<string, unknown> = {
    ...current.metadata,
    ...(suggestion.metadata ?? {}),
  };
  if (suggestion.source) {
    mergedMetadata.smartFillSource = suggestion.source;
  }

  const latValue =
    suggestion.location_lat !== null && suggestion.location_lat !== undefined
      ? String(suggestion.location_lat)
      : current.locationLat;
  const lngValue =
    suggestion.location_lng !== null && suggestion.location_lng !== undefined
      ? String(suggestion.location_lng)
      : current.locationLng;

  const legsFromSuggestion = extractLegsFromSuggestion(suggestion);

  return {
    ...current,
    title: suggestion.title ?? current.title,
    description: suggestion.description ?? current.description,
    locationName: suggestion.location_name ?? current.locationName,
    locationAddress: suggestion.location_address ?? current.locationAddress,
    locationLat: latValue,
    locationLng: lngValue,
    startTime: isoToLocalInput(suggestion.start_time) || current.startTime,
    endTime: isoToLocalInput(suggestion.end_time) || current.endTime,
    isAllDay:
      typeof suggestion.is_all_day === "boolean"
        ? suggestion.is_all_day
        : current.isAllDay,
    providerName: suggestion.provider_name ?? current.providerName,
    confirmationCode: suggestion.confirmation_code ?? current.confirmationCode,
    transportNumber: suggestion.transport_number ?? current.transportNumber,
    timezone: suggestion.timezone ?? current.timezone,
    metadata: mergedMetadata,
    legs:
      legsFromSuggestion && supportsLegsForType(current.type)
        ? legsFromSuggestion
        : current.legs,
  };
}

export function getInitialSegmentForm(): SegmentFormState {
  return {
    type: "flight",
    title: "",
    description: "",
    locationName: "",
    locationAddress: "",
    locationLat: "",
    locationLng: "",
    startTime: "",
    endTime: "",
    timezone: DEFAULT_TIMEZONE,
    isAllDay: false,
    providerName: "",
    confirmationCode: "",
    transportNumber: "",
    seatInfo: "",
    costAmount: "",
    legs: [],
    metadata: {},
  };
}

export const DEFAULT_TIMEZONE = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  } catch (error) {
    console.warn("Unable to resolve timezone", error);
    return "UTC";
  }
})();

export type EndpointKey = "departure" | "arrival";
export type EndpointMetadataField =
  | "airport"
  | "terminal"
  | "timezone"
  | "gate";

type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getStringValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function getEndpointFieldValueFromMetadata(
  metadata: PlainObject,
  endpoint: EndpointKey,
  field: EndpointMetadataField
): string | null {
  const directKey = `${endpoint}_${field}`;
  const direct = getStringValue(metadata[directKey]);
  if (direct) {
    return direct;
  }

  const rawValue = metadata[endpoint];
  if (!rawValue) return null;

  if (typeof rawValue === "string") {
    return field === "airport" ? rawValue : null;
  }

  if (!isPlainObject(rawValue)) return null;
  const raw = rawValue as PlainObject;
  const airportRecord = isPlainObject(raw.airport)
    ? (raw.airport as PlainObject)
    : undefined;

  switch (field) {
    case "airport": {
      return (
        getStringValue(airportRecord?.name) ||
        getStringValue(airportRecord?.shortName) ||
        getStringValue(raw.airportName) ||
        getStringValue(raw.name) ||
        null
      );
    }
    case "terminal": {
      return (
        getStringValue(raw.terminal) || getStringValue(raw.terminalName) || null
      );
    }
    case "timezone": {
      return (
        getStringValue(raw.timezone) ||
        getStringValue(airportRecord?.timeZone) ||
        getStringValue(airportRecord?.timezone) ||
        null
      );
    }
    case "gate": {
      return (
        getStringValue(raw.gate) ||
        getStringValue(raw.gateNumber) ||
        getStringValue(raw.gate_number) ||
        null
      );
    }
    default:
      return null;
  }
}

export function getEndpointFieldValueFromState(
  formState: SegmentFormState,
  endpoint: EndpointKey,
  field: EndpointMetadataField,
  fallback = ""
): string {
  const value = getEndpointFieldValueFromMetadata(
    formState.metadata,
    endpoint,
    field
  );
  if (value && value.length) {
    return value;
  }
  return fallback;
}

export function updateEndpointFieldState(
  prev: SegmentFormState,
  endpoint: EndpointKey,
  field: EndpointMetadataField,
  value: string
): SegmentFormState {
  const keyName = `${endpoint}_${field}`;
  const nextMetadata: Record<string, unknown> = { ...prev.metadata };
  const trimmed = value.trim();
  if (trimmed) {
    nextMetadata[keyName] = trimmed;
  } else {
    delete nextMetadata[keyName];
  }
  return {
    ...prev,
    metadata: nextMetadata,
  };
}
