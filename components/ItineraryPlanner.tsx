"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getCurrentUser } from "@/lib/supabase/queries";
import { Database } from "@/types/supabase";
import type {
  SegmentAutofillSuggestion,
  SegmentAutofillType,
} from "@/lib/autofill/types";

const SEGMENT_TYPES = ["flight"] as const;

type SegmentType = (typeof SEGMENT_TYPES)[number];

type ItineraryRow = Database["public"]["Tables"]["itineraries"]["Row"];
type SegmentRow = Database["public"]["Tables"]["itinerary_segments"]["Row"];
type TravelerRow =
  Database["public"]["Tables"]["itinerary_travelers"]["Row"] & {
    user?: UserSummary | null;
  };
type CommentRow = Database["public"]["Tables"]["itinerary_comments"]["Row"];
type UserSummary = Pick<
  Database["public"]["Tables"]["users"]["Row"],
  "id" | "username" | "name" | "preferred_name" | "profile_image_url"
>;
type ChecklistRow = Database["public"]["Tables"]["itinerary_checklists"]["Row"];
type ChecklistTaskRow = Database["public"]["Tables"]["itinerary_tasks"]["Row"];

type ChecklistWithTasks = ChecklistRow & {
  tasks?: (ChecklistTaskRow & {
    assignee?: UserSummary | null;
  })[];
};

type ItinerarySummary = ItineraryRow & {
  travelers?: TravelerRow[];
};

type DetailedItinerary = ItineraryRow & {
  owner?: UserSummary | null;
  travelers?: TravelerRow[];
  segments?: SegmentRow[];
  checklists?: ChecklistWithTasks[];
};

type CommentWithAuthor = CommentRow & {
  author?: UserSummary | null;
};

type CreateFormState = {
  title: string;
  visibility: "private" | "shared" | "public";
};

type SegmentLegForm = {
  id: string;
  origin: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
  carrier: string;
  number: string;
  seat: string;
};

type SegmentFormState = {
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

type SegmentTypeConfig = {
  key: SegmentType;
  label: string;
  smartFillHint: string;
  titlePlaceholder: string;
  descriptionPlaceholder: string;
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

const SEGMENT_TYPE_CONFIG: Record<SegmentType, SegmentTypeConfig> = {
  flight: {
    key: "flight",
    label: "Flight",
    smartFillHint: "Flight number · e.g., UA 120",
    titlePlaceholder: "UA120 · SFO → NRT",
    descriptionPlaceholder: "Cabin, seat, baggage, or lounge notes",
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

type SegmentTypeOption = {
  value: SegmentType;
  label: string;
};

const SEGMENT_TYPE_OPTIONS: SegmentTypeOption[] = SEGMENT_TYPES.map(
  (segmentType) => ({
    value: segmentType,
    label: SEGMENT_TYPE_CONFIG[segmentType].label,
  })
);

const SMART_FILL_SUPPORTED_TYPES = new Set<SegmentType>(["flight"]);

function normalizeSegmentType(_: string | null | undefined): SegmentType {
  return "flight";
}

function getTypeConfig(value?: string | null): SegmentTypeConfig {
  return SEGMENT_TYPE_CONFIG[normalizeSegmentType(value)];
}

function supportsLegsForType(_: SegmentType): boolean {
  return false;
}

function toAutofillType(_: SegmentType): SegmentAutofillType {
  return "flight";
}

function createLegId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeLegTimeInput(value?: string | null): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    return value;
  }
  return isoToLocalInput(value) || value;
}

function localInputToIso(value: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toISOString();
}

function createEmptyLeg(seed?: Partial<SegmentLegForm>): SegmentLegForm {
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

function parseLegsFromMetadata(
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

function serializeLegs(
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

function parseUsdCostInput(value: string): number | null {
  if (!value) return null;
  const normalized = value
    .replace(/[^0-9.,-]/g, "")
    .replace(/,/g, "")
    .trim();
  if (!normalized) return null;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatUsd(value: number): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      currencyDisplay: "symbol",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `$${value}`;
  }
}

function getSegmentCostDisplay(segment: SegmentRow): string | null {
  if (segment.cost_amount === null || segment.cost_amount === undefined) {
    return null;
  }
  return formatUsd(Number(segment.cost_amount));
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

function buildMetadataPayload(
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

function isoToLocalInput(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const tzOffset = date.getTimezoneOffset() * 60000;
  const local = new Date(date.getTime() - tzOffset);
  return local.toISOString().slice(0, 16);
}

function mergeSmartSuggestion(
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

function getInitialSegmentForm(): SegmentFormState {
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

const DEFAULT_TIMEZONE = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  } catch (error) {
    console.warn("Unable to resolve timezone", error);
    return "UTC";
  }
})();

function getInitialForm(): CreateFormState {
  return {
    title: "",
    visibility: "private",
  };
}

function formatDate(
  value: string | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const formatter = new Intl.DateTimeFormat(
    undefined,
    options ?? {
      month: "short",
      day: "numeric",
      year: "numeric",
    }
  );
  return formatter.format(date);
}

function formatDateRange(
  start: string | null | undefined,
  end: string | null | undefined
): string {
  const startLabel = formatDate(start);
  const endLabel = formatDate(end);
  if (startLabel && endLabel) {
    if (startLabel === endLabel) return startLabel;
    return `${startLabel} – ${endLabel}`;
  }
  if (startLabel) return `From ${startLabel}`;
  if (endLabel) return `Until ${endLabel}`;
  return "Dates TBD";
}

function formatSegmentTime(segment: SegmentRow): string {
  if (segment.is_all_day) {
    const day = formatDate(segment.start_time, {
      month: "short",
      day: "numeric",
    });
    return day ? `${day} · All day` : "All day";
  }
  const start = formatDate(segment.start_time, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const end = formatDate(segment.end_time, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  // Add timezone info for flights
  if (segment.type === "flight" && segment.metadata) {
    const metadata = segment.metadata as Record<string, unknown>;
    const depTz = getEndpointFieldValueFromMetadata(
      metadata,
      "departure",
      "timezone"
    );
    const arrTz = getEndpointFieldValueFromMetadata(
      metadata,
      "arrival",
      "timezone"
    );

    if (start && end) {
      let result = start;
      if (depTz) result += ` ${depTz}`;
      result += ` → ${end}`;
      if (arrTz) result += ` ${arrTz}`;
      return result;
    }
  }

  if (start && end) return `${start} → ${end}`;
  return start ?? end ?? "Timing TBD";
}

function formatFlightDetails(segment: SegmentRow): {
  departure: {
    airport: string | null;
    terminal: string | null;
    gate: string | null;
    timezone: string | null;
  };
  arrival: {
    airport: string | null;
    terminal: string | null;
    gate: string | null;
    timezone: string | null;
  };
} | null {
  if (segment.type !== "flight" || !segment.metadata) return null;
  const metadata = segment.metadata as Record<string, unknown>;
  return {
    departure: {
      airport: getEndpointFieldValueFromMetadata(
        metadata,
        "departure",
        "airport"
      ),
      terminal: getEndpointFieldValueFromMetadata(
        metadata,
        "departure",
        "terminal"
      ),
      gate: getEndpointFieldValueFromMetadata(metadata, "departure", "gate"),
      timezone: getEndpointFieldValueFromMetadata(
        metadata,
        "departure",
        "timezone"
      ),
    },
    arrival: {
      airport: getEndpointFieldValueFromMetadata(
        metadata,
        "arrival",
        "airport"
      ),
      terminal: getEndpointFieldValueFromMetadata(
        metadata,
        "arrival",
        "terminal"
      ),
      gate: getEndpointFieldValueFromMetadata(metadata, "arrival", "gate"),
      timezone: getEndpointFieldValueFromMetadata(
        metadata,
        "arrival",
        "timezone"
      ),
    },
  };
}

type EndpointKey = "departure" | "arrival";
type EndpointMetadataField = "airport" | "terminal" | "timezone" | "gate";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getStringValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function getEndpointFieldValueFromMetadata(
  metadata: Record<string, unknown>,
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
  const raw = rawValue as Record<string, unknown>;
  const airportRecord = isPlainObject(raw.airport)
    ? (raw.airport as Record<string, unknown>)
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

function getEndpointFieldValueFromState(
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

function updateEndpointFieldState(
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

function avatarInitials(name?: string | null, fallback?: string | null) {
  const source = name?.trim() || fallback?.trim();
  if (!source) return "?";
  const normalized = source.replace(/\s+/g, " ");
  return normalized
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase())
    .slice(0, 2)
    .join("");
}

function travelerDisplayName(
  traveler: TravelerRow,
  usersById: Map<string, UserSummary>
): string {
  if (traveler.user_id) {
    const user = usersById.get(traveler.user_id);
    if (user) {
      return (
        user.preferred_name || user.name || user.username || "Unknown traveler"
      );
    }
  }
  if (traveler.email) return traveler.email;
  return "Traveler";
}

export default function ItineraryPlanner() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [itineraries, setItineraries] = useState<ItinerarySummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailedItinerary | null>(null);
  const [comments, setComments] = useState<CommentWithAuthor[]>([]);
  const [commentInput, setCommentInput] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState<CreateFormState>(() =>
    getInitialForm()
  );
  const [creating, setCreating] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<"itinerary" | "travelers">(
    "itinerary"
  );
  const [showSegmentForm, setShowSegmentForm] = useState(false);
  const [segmentForm, setSegmentForm] = useState<SegmentFormState>(() =>
    getInitialSegmentForm()
  );
  const [legsExpanded, setLegsExpanded] = useState(true);
  const [smartFillInput, setSmartFillInput] = useState("");
  const [smartFillDate, setSmartFillDate] = useState("");
  const [smartFillSuggestion, setSmartFillSuggestion] =
    useState<SegmentAutofillSuggestion | null>(null);
  const [smartFillLoading, setSmartFillLoading] = useState(false);
  const [smartFillError, setSmartFillError] = useState<string | null>(null);
  const [creatingSegment, setCreatingSegment] = useState(false);
  const [editSmartFillInput, setEditSmartFillInput] = useState("");
  const [editSmartFillDate, setEditSmartFillDate] = useState("");
  const [editSmartFillSuggestion, setEditSmartFillSuggestion] =
    useState<SegmentAutofillSuggestion | null>(null);
  const [editSmartFillLoading, setEditSmartFillLoading] = useState(false);
  const [editSmartFillError, setEditSmartFillError] = useState<string | null>(
    null
  );
  const [isEditingHeader, setIsEditingHeader] = useState(false);
  const [editHeaderForm, setEditHeaderForm] = useState<CreateFormState>(
    getInitialForm()
  );
  const [updatingHeader, setUpdatingHeader] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [editSegmentForm, setEditSegmentForm] = useState<SegmentFormState>(
    getInitialSegmentForm()
  );
  const [updatingSegment, setUpdatingSegment] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [checklistItems, setChecklistItems] = useState<
    Record<string, { id: string; text: string; completed: boolean }[]>
  >({});
  const [addingChecklistItem, setAddingChecklistItem] = useState<
    Record<string, boolean>
  >({});
  const [newChecklistText, setNewChecklistText] = useState<
    Record<string, string>
  >({});
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState("");

  const resetSegmentForm = useCallback(() => {
    setSegmentForm(getInitialSegmentForm());
    setSmartFillInput("");
    setSmartFillDate("");
    setSmartFillSuggestion(null);
    setSmartFillError(null);
    setSmartFillLoading(false);
    setLegsExpanded(true);
  }, []);

  const handleCreateLegAdd = useCallback(() => {
    setSegmentForm((prev) => ({
      ...prev,
      legs: [...prev.legs, createEmptyLeg()],
    }));
  }, []);

  const handleCreateLegChange = useCallback(
    (legId: string, field: keyof SegmentLegForm, value: string) => {
      setSegmentForm((prev) => ({
        ...prev,
        legs: prev.legs.map((leg) =>
          leg.id === legId ? { ...leg, [field]: value } : leg
        ),
      }));
    },
    []
  );

  const handleCreateLegRemove = useCallback((legId: string) => {
    setSegmentForm((prev) => ({
      ...prev,
      legs: prev.legs.filter((leg) => leg.id !== legId),
    }));
  }, []);

  const handleAddChecklistItem = useCallback(
    (segmentId: string) => {
      const text = newChecklistText[segmentId]?.trim();
      if (!text || text.length > 50) return;

      const newItem = {
        id: `temp-${Date.now()}-${Math.random()}`,
        text,
        completed: false,
      };

      setChecklistItems((prev) => ({
        ...prev,
        [segmentId]: [...(prev[segmentId] || []), newItem],
      }));

      setNewChecklistText((prev) => ({
        ...prev,
        [segmentId]: "",
      }));

      setAddingChecklistItem((prev) => ({
        ...prev,
        [segmentId]: false,
      }));
    },
    [newChecklistText]
  );

  const handleDeleteChecklistItem = useCallback(
    (segmentId: string, itemId: string) => {
      setChecklistItems((prev) => ({
        ...prev,
        [segmentId]: (prev[segmentId] || []).filter(
          (item) => item.id !== itemId
        ),
      }));
    },
    []
  );

  const handleToggleChecklistItem = useCallback(
    (segmentId: string, itemId: string) => {
      setChecklistItems((prev) => ({
        ...prev,
        [segmentId]: (prev[segmentId] || []).map((item) =>
          item.id === itemId ? { ...item, completed: !item.completed } : item
        ),
      }));
    },
    []
  );

  const closeSegmentModal = useCallback(() => {
    resetSegmentForm();
    setShowSegmentForm(false);
  }, [resetSegmentForm]);

  useEffect(() => {
    setSegmentForm((prev) => {
      const supports = supportsLegsForType(prev.type);
      if (supports && prev.legs.length === 0) {
        return { ...prev, legs: [createEmptyLeg()] };
      }
      if (!supports && prev.legs.length > 0) {
        return { ...prev, legs: [] };
      }
      return prev;
    });
  }, [segmentForm.type]);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 5000);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingUser(true);
      const { user } = await getCurrentUser();
      if (!cancelled) {
        setUserId(user?.id ?? null);
        setLoadingUser(false);
        if (!user) {
          setFeedback({
            type: "error",
            text: "You need to be signed in to manage itineraries.",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadItineraries = useCallback(async (currentUserId: string) => {
    setListLoading(true);
    try {
      const response = await fetch(
        `/api/itineraries?user_id=${encodeURIComponent(currentUserId)}`,
        {
          cache: "no-store",
          headers: {
            "x-user-id": currentUserId,
          },
        }
      );
      if (!response.ok) {
        throw new Error(`Failed to load itineraries (${response.status})`);
      }
      const payload = await response.json();
      const items: ItinerarySummary[] = payload?.data ?? [];
      setItineraries(items);
      if (!items.length) {
        setDetail(null);
        setComments([]);
        setSelectedId(null);
        return;
      }
      setSelectedId((prev) => {
        if (prev && items.some((itinerary) => itinerary.id === prev)) {
          return prev;
        }
        return items[0].id;
      });
    } catch (error) {
      console.error(error);
      setFeedback({
        type: "error",
        text: "Unable to load itineraries right now.",
      });
      setItineraries([]);
      setDetail(null);
      setComments([]);
      setSelectedId(null);
    } finally {
      setListLoading(false);
    }
  }, []);

  const loadComments = useCallback(
    async (itineraryId: string, currentUserId: string) => {
      try {
        const response = await fetch(
          `/api/itineraries/${encodeURIComponent(
            itineraryId
          )}/comments?user_id=${encodeURIComponent(currentUserId)}`,
          {
            cache: "no-store",
            headers: {
              "x-user-id": currentUserId,
            },
          }
        );
        if (!response.ok) {
          const errorPayload = await response.json().catch(() => ({}));
          const message =
            errorPayload?.error ||
            `Failed to load comments (${response.status ?? "unknown"})`;
          throw new Error(message);
        }
        const payload = await response.json();
        setComments(payload?.data ?? []);
      } catch (error) {
        console.error(error);
        setFeedback({
          type: "error",
          text:
            error instanceof Error && error.message
              ? error.message
              : "Unable to load itinerary comments.",
        });
        setComments([]);
      }
    },
    []
  );

  const loadItineraryDetail = useCallback(
    async (itineraryId: string, currentUserId: string) => {
      setDetailLoading(true);
      try {
        const response = await fetch(
          `/api/itineraries/${encodeURIComponent(
            itineraryId
          )}?user_id=${encodeURIComponent(currentUserId)}`,
          {
            cache: "no-store",
            headers: {
              "x-user-id": currentUserId,
            },
          }
        );
        if (!response.ok) {
          const errorPayload = await response.json().catch(() => ({}));
          const message =
            errorPayload?.error ||
            `Failed to load itinerary (${response.status ?? "unknown"})`;
          throw new Error(message);
        }
        const payload = await response.json();
        setDetail(payload?.data ?? null);
        await loadComments(itineraryId, currentUserId);
      } catch (error) {
        console.error(error);
        setFeedback({
          type: "error",
          text:
            error instanceof Error && error.message
              ? error.message
              : "Unable to load itinerary details.",
        });
        setDetail(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [loadComments]
  );

  useEffect(() => {
    if (!userId) return;
    loadItineraries(userId);
  }, [userId, loadItineraries]);

  useEffect(() => {
    if (!userId || !selectedId) return;
    loadItineraryDetail(selectedId, userId);
  }, [userId, selectedId, itineraries, loadItineraryDetail]);

  useEffect(() => {
    if (!itineraries.length) {
      setSelectedId(null);
      return;
    }
    setSelectedId((prev) => {
      if (prev && itineraries.some((itinerary) => itinerary.id === prev)) {
        return prev;
      }
      return itineraries[0].id;
    });
  }, [itineraries]);

  const usersById = useMemo(() => {
    const map = new Map<string, UserSummary>();
    if (detail?.owner) {
      map.set(detail.owner.id, detail.owner);
    }
    if (detail?.travelers) {
      detail.travelers.forEach((traveler) => {
        const relatedUser = (
          traveler as {
            user?: UserSummary | null;
          }
        ).user;
        if (traveler.user_id && relatedUser) {
          map.set(traveler.user_id, relatedUser);
        }
      });
    }
    return map;
  }, [detail]);

  const selectedSummary = useMemo(() => {
    if (!selectedId) return null;
    return itineraries.find((itinerary) => itinerary.id === selectedId) ?? null;
  }, [itineraries, selectedId]);

  const handleSelectItinerary = useCallback(
    (itineraryId: string) => {
      setSelectedId(itineraryId);
      if (typeof window !== "undefined") {
        const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
        if (!isDesktop) {
          setSidebarOpen(false);
        }
      }
    },
    [setSelectedId, setSidebarOpen]
  );

  const handleCreateItinerary = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    if (!userId) {
      setFeedback({
        type: "error",
        text: "You need to be signed in before creating an itinerary.",
      });
      return;
    }
    if (!createForm.title.trim()) {
      setFeedback({ type: "error", text: "Title is required." });
      return;
    }

    setCreating(true);
    try {
      const response = await fetch("/api/itineraries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          owner_id: userId,
          title: createForm.title.trim(),
          visibility: createForm.visibility || undefined,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || "Failed to create itinerary");
      }

      setFeedback({
        type: "success",
        text: "Itinerary created successfully!",
      });
      setCreateForm(getInitialForm());
      setShowCreateForm(false);
      await loadItineraries(userId);
    } catch (error) {
      console.error(error);
      setFeedback({
        type: "error",
        text: (error as Error).message || "Unable to create itinerary.",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleCommentSubmit = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    if (!userId || !selectedId) return;
    if (!commentInput.trim()) {
      setFeedback({ type: "error", text: "Add a note before sending." });
      return;
    }
    setCommentSubmitting(true);
    try {
      const response = await fetch(
        `/api/itineraries/${encodeURIComponent(selectedId)}/comments`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            user_id: userId,
            body: commentInput.trim(),
          }),
        }
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || "Failed to post comment");
      }
      setCommentInput("");
      await loadComments(selectedId, userId);
    } catch (error) {
      console.error(error);
      setFeedback({
        type: "error",
        text: (error as Error).message || "Unable to post comment.",
      });
    } finally {
      setCommentSubmitting(false);
    }
  };

  const handleEditComment = async (commentId: string) => {
    if (!userId || !selectedId || !editCommentText.trim()) return;
    try {
      const response = await fetch(
        `/api/itineraries/${encodeURIComponent(
          selectedId
        )}/comments/${encodeURIComponent(commentId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: userId,
            body: editCommentText.trim(),
          }),
        }
      );
      if (!response.ok) throw new Error("Failed to update comment");
      setEditingCommentId(null);
      setEditCommentText("");
      await loadComments(selectedId, userId);
      setFeedback({ type: "success", text: "Comment updated!" });
    } catch (error) {
      setFeedback({ type: "error", text: "Failed to update comment." });
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!userId || !selectedId) return;
    if (!confirm("Delete this comment?")) return;
    try {
      const response = await fetch(
        `/api/itineraries/${encodeURIComponent(
          selectedId
        )}/comments/${encodeURIComponent(commentId)}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId }),
        }
      );
      if (!response.ok) throw new Error("Failed to delete comment");
      await loadComments(selectedId, userId);
      setFeedback({ type: "success", text: "Comment deleted!" });
    } catch (error) {
      setFeedback({ type: "error", text: "Failed to delete comment." });
    }
  };

  const handleCreateSegment = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    if (!userId || !selectedId) {
      setFeedback({
        type: "error",
        text: "You need to select an itinerary first.",
      });
      return;
    }
    if (!segmentForm.title.trim()) {
      setFeedback({ type: "error", text: "Segment title is required." });
      return;
    }

    setCreatingSegment(true);
    try {
      const latValue = Number.parseFloat(segmentForm.locationLat);
      const lngValue = Number.parseFloat(segmentForm.locationLng);
      const metadataPayload = buildMetadataPayload(segmentForm);
      const costAmountValue = parseUsdCostInput(segmentForm.costAmount);

      const response = await fetch(
        `/api/itineraries/${encodeURIComponent(selectedId)}/segments`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            user_id: userId,
            type: segmentForm.type,
            title: segmentForm.title.trim(),
            description: segmentForm.description.trim() || null,
            location_name: segmentForm.locationName.trim() || null,
            location_address: segmentForm.locationAddress.trim() || null,
            location_lat: Number.isFinite(latValue) ? latValue : null,
            location_lng: Number.isFinite(lngValue) ? lngValue : null,
            start_time: segmentForm.startTime || null,
            end_time: segmentForm.endTime || null,
            is_all_day: segmentForm.isAllDay,
            provider_name: segmentForm.providerName.trim() || null,
            confirmation_code: segmentForm.confirmationCode.trim() || null,
            transport_number: segmentForm.transportNumber.trim() || null,
            seat_info: segmentForm.seatInfo.trim() || null,
            timezone: segmentForm.timezone,
            cost_amount: costAmountValue,
            cost_currency: costAmountValue !== null ? "USD" : null,
            metadata: metadataPayload,
          }),
        }
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || "Failed to create segment");
      }

      setFeedback({
        type: "success",
        text: "Segment added to your itinerary!",
      });
      closeSegmentModal();
      // Reload the itinerary detail to show the new segment
      await loadItineraryDetail(selectedId, userId);
    } catch (error) {
      console.error(error);
      setFeedback({
        type: "error",
        text: (error as Error).message || "Unable to create segment.",
      });
    } finally {
      setCreatingSegment(false);
    }
  };

  const handleSmartFill = async (event?: React.FormEvent) => {
    if (event) event.preventDefault();
    setSmartFillError(null);
    if (!segmentForm.type) {
      setSmartFillError("Select a segment type first.");
      return;
    }
    if (!smartFillSupported) {
      setSmartFillError(
        "Smart fill is only available for flights, trains, stays, meals, and activities right now."
      );
      return;
    }

    const fallbackQuery =
      segmentForm.transportNumber.trim() ||
      segmentForm.title.trim() ||
      segmentForm.locationName.trim();
    const query = smartFillInput.trim() || fallbackQuery;
    if (!query) {
      setSmartFillError("Add a quick description or code to smart fill.");
      return;
    }

    const dateCandidate =
      smartFillDate ||
      (segmentForm.startTime ? segmentForm.startTime.slice(0, 10) : undefined);
    const latValue = Number.parseFloat(segmentForm.locationLat);
    const lngValue = Number.parseFloat(segmentForm.locationLng);
    const hasContext = Number.isFinite(latValue) && Number.isFinite(lngValue);
    const autofillType = toAutofillType(segmentForm.type);

    setSmartFillLoading(true);
    try {
      const response = await fetch("/api/segments/autofill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: autofillType,
          query,
          date: dateCandidate,
          context: hasContext
            ? { lat: latValue, lng: lngValue, radiusMeters: 20000 }
            : undefined,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        console.error(
          "[Smart Fill] /api/segments/autofill responded with",
          response.status,
          payload
        );
        throw new Error(
          (payload as { error?: string })?.error ||
            "Unable to fetch smart fill data."
        );
      }

      const suggestion = (payload as { data?: SegmentAutofillSuggestion })
        ?.data;
      if (!suggestion) {
        throw new Error("No suggestions were returned for that input.");
      }

      setSegmentForm((prev) => mergeSmartSuggestion(prev, suggestion));
      setSmartFillSuggestion(suggestion);
      setSmartFillError(null);
      setFeedback({
        type: "success",
        text: "Smart fill applied. Feel free to tweak the details.",
      });
    } catch (error) {
      console.error(error);
      setSmartFillError(
        error instanceof Error
          ? error.message
          : "Unable to complete smart fill."
      );
    } finally {
      setSmartFillLoading(false);
    }
  };

  const clearSmartFillSuggestion = () => {
    setSmartFillSuggestion(null);
    setSmartFillError(null);
  };

  const handleEditSmartFill = async (event?: React.FormEvent) => {
    if (event) event.preventDefault();
    setEditSmartFillError(null);
    if (!editSegmentForm.type) {
      setEditSmartFillError("Select a segment type first.");
      return;
    }
    if (!editSmartFillSupported) {
      setEditSmartFillError(
        "Smart fill is only available for flights, trains, stays, meals, and activities right now."
      );
      return;
    }

    const fallbackQuery =
      editSegmentForm.transportNumber.trim() ||
      editSegmentForm.title.trim() ||
      editSegmentForm.locationName.trim();
    const query = editSmartFillInput.trim() || fallbackQuery;
    if (!query) {
      setEditSmartFillError("Add a quick description or code to smart fill.");
      return;
    }

    const dateCandidate =
      editSmartFillDate ||
      (editSegmentForm.startTime
        ? editSegmentForm.startTime.slice(0, 10)
        : undefined);
    const latValue = Number.parseFloat(editSegmentForm.locationLat);
    const lngValue = Number.parseFloat(editSegmentForm.locationLng);
    const hasContext = Number.isFinite(latValue) && Number.isFinite(lngValue);
    const autofillType = toAutofillType(editSegmentForm.type);

    setEditSmartFillLoading(true);
    try {
      const response = await fetch("/api/segments/autofill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: autofillType,
          query,
          date: dateCandidate,
          context: hasContext
            ? { lat: latValue, lng: lngValue, radiusMeters: 20000 }
            : undefined,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        console.error(
          "[Smart Fill] /api/segments/autofill responded with",
          response.status,
          payload
        );
        throw new Error(
          (payload as { error?: string })?.error ||
            "Unable to fetch smart fill data."
        );
      }

      const suggestion = (payload as { data?: SegmentAutofillSuggestion })
        ?.data;
      if (!suggestion) {
        throw new Error("No suggestions were returned for that input.");
      }

      setEditSegmentForm((prev) => mergeSmartSuggestion(prev, suggestion));
      setEditSmartFillSuggestion(suggestion);
      setEditSmartFillError(null);
      setFeedback({
        type: "success",
        text: "Smart fill applied. Feel free to tweak the details.",
      });
    } catch (error) {
      console.error(error);
      setEditSmartFillError(
        error instanceof Error
          ? error.message
          : "Unable to complete smart fill."
      );
    } finally {
      setEditSmartFillLoading(false);
    }
  };

  const clearEditSmartFillSuggestion = () => {
    setEditSmartFillSuggestion(null);
    setEditSmartFillError(null);
  };

  const handleEndpointFieldChange = useCallback(
    (endpoint: EndpointKey, field: EndpointMetadataField, value: string) => {
      setSegmentForm((prev) =>
        updateEndpointFieldState(prev, endpoint, field, value)
      );
    },
    [setSegmentForm]
  );
  const handleUpdateItinerary = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!userId || !selectedId || !detail) return;
    setUpdatingHeader(true);
    try {
      const response = await fetch(
        `/api/itineraries/${encodeURIComponent(selectedId)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            owner_id: userId,
            title: editHeaderForm.title,
            visibility: editHeaderForm.visibility,
          }),
        }
      );
      if (!response.ok) throw new Error("Failed to update itinerary");
      setFeedback({ type: "success", text: "Itinerary updated!" });
      setIsEditingHeader(false);
      setIsEditingTitle(false);
      await loadItineraryDetail(selectedId, userId);
      await loadItineraries(userId);
    } catch (error) {
      setFeedback({ type: "error", text: "Failed to update itinerary." });
    } finally {
      setUpdatingHeader(false);
    }
  };

  const handleUpdateSegment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !selectedId || !editingSegmentId) return;
    setUpdatingSegment(true);
    try {
      const latValue = Number.parseFloat(editSegmentForm.locationLat);
      const lngValue = Number.parseFloat(editSegmentForm.locationLng);
      const metadataPayload = buildMetadataPayload(editSegmentForm);
      const costAmountValue = parseUsdCostInput(editSegmentForm.costAmount);

      const response = await fetch(
        `/api/itineraries/${encodeURIComponent(
          selectedId
        )}/segments/${encodeURIComponent(editingSegmentId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: userId,
            type: editSegmentForm.type,
            title: editSegmentForm.title,
            description: editSegmentForm.description,
            location_name: editSegmentForm.locationName,
            location_address: editSegmentForm.locationAddress,
            location_lat: Number.isFinite(latValue) ? latValue : null,
            location_lng: Number.isFinite(lngValue) ? lngValue : null,
            start_time: localInputToIso(editSegmentForm.startTime),
            end_time: localInputToIso(editSegmentForm.endTime),
            is_all_day: editSegmentForm.isAllDay,
            provider_name: editSegmentForm.providerName,
            confirmation_code: editSegmentForm.confirmationCode,
            transport_number: editSegmentForm.transportNumber,
            seat_info: editSegmentForm.seatInfo
              ? editSegmentForm.seatInfo.trim()
              : null,
            timezone: editSegmentForm.timezone,
            cost_amount: costAmountValue,
            cost_currency: costAmountValue !== null ? "USD" : null,
            metadata: metadataPayload,
          }),
        }
      );
      if (!response.ok) throw new Error("Failed to update segment");
      setFeedback({ type: "success", text: "Segment updated!" });
      setEditingSegmentId(null);
      await loadItineraryDetail(selectedId, userId);
    } catch (error) {
      setFeedback({ type: "error", text: "Failed to update segment." });
    } finally {
      setUpdatingSegment(false);
    }
  };

  const handleEditEndpointFieldChange = useCallback(
    (endpoint: EndpointKey, field: EndpointMetadataField, value: string) => {
      setEditSegmentForm((prev) =>
        updateEndpointFieldState(prev, endpoint, field, value)
      );
    },
    []
  );

  const handleEditLegAdd = useCallback(() => {
    setEditSegmentForm((prev) => ({
      ...prev,
      legs: [...prev.legs, createEmptyLeg()],
    }));
  }, []);

  const handleEditLegChange = useCallback(
    (legId: string, field: keyof SegmentLegForm, value: string) => {
      setEditSegmentForm((prev) => ({
        ...prev,
        legs: prev.legs.map((leg) =>
          leg.id === legId ? { ...leg, [field]: value } : leg
        ),
      }));
    },
    []
  );

  const handleEditLegRemove = useCallback((legId: string) => {
    setEditSegmentForm((prev) => ({
      ...prev,
      legs: prev.legs.filter((leg) => leg.id !== legId),
    }));
  }, []);

  const handleDeleteSegment = async (segmentId: string) => {
    if (
      !userId ||
      !selectedId ||
      !window.confirm("Are you sure you want to delete this segment?")
    )
      return;
    try {
      const response = await fetch(
        `/api/itineraries/${encodeURIComponent(
          selectedId
        )}/segments/${encodeURIComponent(
          segmentId
        )}?user_id=${encodeURIComponent(userId)}`,
        { method: "DELETE" }
      );
      if (!response.ok) throw new Error("Failed to delete segment");
      setFeedback({ type: "success", text: "Segment deleted." });
      await loadItineraryDetail(selectedId, userId);
    } catch (error) {
      setFeedback({ type: "error", text: "Failed to delete segment." });
    }
  };

  const startEditingHeader = () => {
    if (!detail) return;
    setEditHeaderForm({
      title: detail.title || "",
      visibility: detail.visibility || "private",
    });
    setIsEditingHeader(true);
  };

  const startEditingSegment = (segment: SegmentRow) => {
    const segmentMetadata =
      segment.metadata && typeof segment.metadata === "object"
        ? (segment.metadata as Record<string, unknown>)
        : {};
    const timezoneFromMetadata =
      typeof segmentMetadata.timezone === "string"
        ? (segmentMetadata.timezone as string)
        : DEFAULT_TIMEZONE;

    setEditSegmentForm({
      type: normalizeSegmentType(segment.type),
      title: segment.title || "",
      description: segment.description || "",
      locationName: segment.location_name || "",
      locationAddress: segment.location_address || "",
      locationLat:
        typeof segment.location_lat === "number"
          ? segment.location_lat.toString()
          : "",
      locationLng:
        typeof segment.location_lng === "number"
          ? segment.location_lng.toString()
          : "",
      startTime: segment.start_time ? segment.start_time.slice(0, 16) : "",
      endTime: segment.end_time ? segment.end_time.slice(0, 16) : "",
      isAllDay: segment.is_all_day || false,
      providerName: segment.provider_name || "",
      confirmationCode: segment.confirmation_code || "",
      transportNumber: segment.transport_number || "",
      costAmount:
        segment.cost_amount !== null && segment.cost_amount !== undefined
          ? segment.cost_amount.toString()
          : "",
      timezone: timezoneFromMetadata,
      seatInfo: segment.seat_info || "",
      legs: parseLegsFromMetadata(segmentMetadata),
      metadata: segmentMetadata,
    });
    setEditSmartFillInput("");
    setEditSmartFillDate("");
    setEditSmartFillSuggestion(null);
    setEditSmartFillError(null);
    setEditSmartFillLoading(false);
    setEditingSegmentId(segment.id);
  };

  const travelerCount = detail?.travelers?.length ?? 0;
  const segmentCount = detail?.segments?.length ?? 0;

  const inferredDates = useMemo(() => {
    if (!detail?.segments?.length) return { start: null, end: null };
    let minStart: Date | null = null;
    let maxEnd: Date | null = null;
    detail.segments.forEach((s) => {
      if (s.start_time) {
        const d = new Date(s.start_time);
        if (!minStart || d < minStart) minStart = d;
        if (!maxEnd || d > maxEnd) maxEnd = d;
      }
      if (s.end_time) {
        const d = new Date(s.end_time);
        if (!maxEnd || d > maxEnd) maxEnd = d;
      }
    });
    return {
      start: minStart ? (minStart as Date).toISOString() : null,
      end: maxEnd ? (maxEnd as Date).toISOString() : null,
    };
  }, [detail?.segments]);

  const tripDurationLabel = useMemo(() => {
    const { start: startDateStr, end: endDateStr } = inferredDates;
    if (!startDateStr || !endDateStr) return "Flexible timing";
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return "Flexible timing";
    }
    const diffDays =
      Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    if (diffDays <= 0) {
      return "Flexible timing";
    }
    return `${diffDays} day${diffDays === 1 ? "" : "s"}`;
  }, [inferredDates]);

  const createFormTypeConfig = useMemo(
    () => getTypeConfig(segmentForm.type),
    [segmentForm.type]
  );
  const smartFillPlaceholder = createFormTypeConfig.smartFillHint;
  const {
    label: createTypeLabel,
    titlePlaceholder,
    descriptionPlaceholder,
    providerLabel,
    providerPlaceholder,
    confirmationLabel,
    confirmationPlaceholder,
    referenceLabel,
    referencePlaceholder,
    seatLabel,
    seatPlaceholder,
  } = createFormTypeConfig;
  const titlePlaceholderText = titlePlaceholder || "Segment title";
  const descriptionPlaceholderText =
    descriptionPlaceholder || "Add any notes or details";
  const providerPlaceholderText = providerPlaceholder || "Company or host";
  const confirmationPlaceholderText =
    confirmationPlaceholder || "Confirmation or booking code";
  const referencePlaceholderText = referencePlaceholder || "Reference";
  const seatPlaceholderText = seatPlaceholder || "Seat info";
  const providerLabelText = providerLabel || "Provider";
  const confirmationLabelText = confirmationLabel || "Confirmation";
  const showReferenceField = Boolean(referenceLabel);
  const referenceLabelText = referenceLabel || "Reference";
  const showSeatField = Boolean(createFormTypeConfig.showSeatInput);
  const seatLabelText = seatLabel || "Seat";
  const showLegsEditor = supportsLegsForType(segmentForm.type);
  const smartFillSupported = SMART_FILL_SUPPORTED_TYPES.has(segmentForm.type);
  const editFormTypeConfig = useMemo(
    () => getTypeConfig(editSegmentForm.type),
    [editSegmentForm.type]
  );
  const editSmartFillSupported = SMART_FILL_SUPPORTED_TYPES.has(
    editSegmentForm.type
  );
  const editSmartFillPlaceholder = editFormTypeConfig.smartFillHint;
  const editTitlePlaceholderText =
    editFormTypeConfig.titlePlaceholder || "Segment title";
  const editProviderLabelText = editFormTypeConfig.providerLabel || "Provider";
  const editProviderPlaceholderText =
    editFormTypeConfig.providerPlaceholder || "Company or host";
  const editConfirmationLabelText =
    editFormTypeConfig.confirmationLabel || "Confirmation";
  const editConfirmationPlaceholderText =
    editFormTypeConfig.confirmationPlaceholder ||
    "Confirmation or booking code";
  const editShowReferenceField = Boolean(editFormTypeConfig.referenceLabel);
  const editReferenceLabelText =
    editFormTypeConfig.referenceLabel || "Reference";
  const editReferencePlaceholderText =
    editFormTypeConfig.referencePlaceholder || "Reference";
  const editShowSeatField = Boolean(editFormTypeConfig.showSeatInput);
  const editSeatLabelText = editFormTypeConfig.seatLabel || "Seat";
  const editSeatPlaceholderText =
    editFormTypeConfig.seatPlaceholder || "Seat info";
  const editIsFlightSegment = editSegmentForm.type === "flight";
  const editDepartureAirportValue = getEndpointFieldValueFromState(
    editSegmentForm,
    "departure",
    "airport",
    editSegmentForm.locationName
  );
  const editDepartureTerminalValue = getEndpointFieldValueFromState(
    editSegmentForm,
    "departure",
    "terminal"
  );
  const editDepartureGateValue = getEndpointFieldValueFromState(
    editSegmentForm,
    "departure",
    "gate"
  );
  const editDepartureTimezoneValue = getEndpointFieldValueFromState(
    editSegmentForm,
    "departure",
    "timezone"
  );
  const editArrivalAirportValue = getEndpointFieldValueFromState(
    editSegmentForm,
    "arrival",
    "airport",
    editSegmentForm.locationAddress
  );
  const editArrivalTerminalValue = getEndpointFieldValueFromState(
    editSegmentForm,
    "arrival",
    "terminal"
  );
  const editArrivalGateValue = getEndpointFieldValueFromState(
    editSegmentForm,
    "arrival",
    "gate"
  );
  const editArrivalTimezoneValue = getEndpointFieldValueFromState(
    editSegmentForm,
    "arrival",
    "timezone"
  );
  const isFlightSegment = segmentForm.type === "flight";
  const departureAirportValue = getEndpointFieldValueFromState(
    segmentForm,
    "departure",
    "airport",
    segmentForm.locationName
  );
  const departureTerminalValue = getEndpointFieldValueFromState(
    segmentForm,
    "departure",
    "terminal"
  );
  const departureGateValue = getEndpointFieldValueFromState(
    segmentForm,
    "departure",
    "gate"
  );
  const departureTimezoneValue = getEndpointFieldValueFromState(
    segmentForm,
    "departure",
    "timezone"
  );
  const arrivalAirportValue = getEndpointFieldValueFromState(
    segmentForm,
    "arrival",
    "airport",
    segmentForm.locationAddress
  );
  const arrivalTerminalValue = getEndpointFieldValueFromState(
    segmentForm,
    "arrival",
    "terminal"
  );
  const arrivalGateValue = getEndpointFieldValueFromState(
    segmentForm,
    "arrival",
    "gate"
  );
  const arrivalTimezoneValue = getEndpointFieldValueFromState(
    segmentForm,
    "arrival",
    "timezone"
  );
  const partnersHeading = isFlightSegment ? "Flight" : "Partners & references";
  const budgetHeading = isFlightSegment ? "Cost" : "Budget & tracking";
  const partnersSection = (
    <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/60 dark:bg-gray-950/40 p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500">
          {partnersHeading}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {providerLabelText}
          </label>
          <input
            type="text"
            value={segmentForm.providerName}
            onChange={(e) =>
              setSegmentForm((prev) => ({
                ...prev,
                providerName: e.target.value,
              }))
            }
            className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={providerPlaceholderText}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {confirmationLabelText}
          </label>
          <input
            type="text"
            value={segmentForm.confirmationCode}
            onChange={(e) =>
              setSegmentForm((prev) => ({
                ...prev,
                confirmationCode: e.target.value,
              }))
            }
            className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={confirmationPlaceholderText}
          />
        </div>
      </div>
      {showReferenceField && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {referenceLabelText}
          </label>
          <input
            type="text"
            value={segmentForm.transportNumber}
            onChange={(e) =>
              setSegmentForm((prev) => ({
                ...prev,
                transportNumber: e.target.value,
              }))
            }
            className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={referencePlaceholderText}
          />
        </div>
      )}
      {showSeatField && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {seatLabelText}
          </label>
          <input
            type="text"
            value={segmentForm.seatInfo}
            onChange={(e) =>
              setSegmentForm((prev) => ({
                ...prev,
                seatInfo: e.target.value,
              }))
            }
            className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={seatPlaceholderText}
          />
        </div>
      )}
    </section>
  );

  const budgetSection = (
    <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/60 dark:bg-gray-950/40 p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500">
          {budgetHeading}
        </p>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Cost (USD)
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm font-semibold text-gray-500 dark:text-gray-400">
            $
          </span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={segmentForm.costAmount}
            onChange={(e) =>
              setSegmentForm((prev) => ({
                ...prev,
                costAmount: e.target.value,
              }))
            }
            className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 pl-7 pr-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="0.00"
          />
        </div>
      </div>
    </section>
  );

  const cols = (showReferenceField ? 1 : 0) + (showSeatField ? 1 : 0) + 2;

  return (
    <div className="flex flex-col h-full">
      {feedback && (
        <div className="px-6 py-4">
          <div
            className={`rounded-xl border px-4 py-3 text-sm font-medium shadow-sm ${
              feedback.type === "success"
                ? "border-green-200 bg-green-50 text-green-700 dark:border-green-900/40 dark:bg-green-950/40 dark:text-green-200"
                : "border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200"
            }`}
          >
            {feedback.text}
          </div>
        </div>
      )}

      <div
        className={`relative z-0 flex-1 h-full transition-[padding] duration-300 ease-in-out px-4 sm:px-6 ${
          sidebarOpen ? "lg:pl-[21rem] lg:pr-10" : "lg:px-10 lg:pl-16"
        }`}
      >
        {sidebarOpen && (
          <div
            className="absolute inset-0 z-10 bg-gray-900/40 backdrop-blur-sm transition-opacity duration-300 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        {!sidebarOpen && (
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="absolute top-3 left-3 z-20 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 shadow-sm transition hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
            aria-controls="itinerary-sidebar"
            aria-label="Expand itinerary list"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 6l6 6-6 6"
              />
            </svg>
          </button>
        )}

        <aside
          id="itinerary-sidebar"
          className={`absolute inset-y-0 left-0 z-30 w-full sm:w-[18rem] lg:w-[19rem] transition-transform duration-300 ease-in-out border-r border-gray-100 dark:border-gray-800 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex h-full flex-col bg-white dark:bg-gray-900 shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b border-gray-100 dark:border-gray-800 px-6 py-5">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  Itineraries ({itineraries.length})
                </p>
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => setShowCreateForm((open) => !open)}
                  className={`flex h-10 items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold shadow-sm transition-all duration-200 active:scale-95 ${
                    showCreateForm
                      ? "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200"
                      : "bg-blue-600 text-white hover:bg-blue-700 hover:shadow-blue-500/20"
                  }`}
                  disabled={loadingUser || listLoading}
                >
                  {showCreateForm ? (
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                  )}
                  <span>{showCreateForm ? "Close" : "New"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-100 bg-white text-gray-400 shadow-sm transition-all hover:text-gray-900 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-500 @lg:hidden"
                  aria-label="Collapse itinerary list"
                >
                  <svg
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {showCreateForm && (
                <form
                  onSubmit={handleCreateItinerary}
                  className="space-y-4 border-b border-gray-200 px-5 py-4 dark:border-gray-800"
                >
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                      Title
                    </label>
                    <input
                      type="text"
                      value={createForm.title}
                      onChange={(event) =>
                        setCreateForm((prev) => ({
                          ...prev,
                          title: event.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Tokyo R&D Summit"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                        Visibility
                      </label>
                      <select className="mt-1 w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="private">Private</option>
                        <option value="shared">Shared</option>
                        <option value="public">Public</option>
                      </select>
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="w-full rounded-xl bg-blue-600 text-white px-4 py-2 text-sm font-semibold shadow hover:bg-blue-700 transition disabled:cursor-not-allowed disabled:opacity-70"
                    disabled={creating}
                  >
                    {creating ? "Creating..." : "Create itinerary"}
                  </button>
                </form>
              )}

              {listLoading ? (
                <div className="px-5 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                  Loading itineraries...
                </div>
              ) : !itineraries.length ? (
                <div className="px-5 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                  {loadingUser
                    ? "Checking your account..."
                    : "Create your first itinerary to get started."}
                </div>
              ) : (
                <div className="divide-y divide-gray-50 dark:divide-gray-800/50">
                  {itineraries.map((itinerary) => {
                    const travelerTotal = Math.max(
                      itinerary.travelers?.length ?? 0,
                      1
                    );
                    const isSelected = selectedId === itinerary.id;

                    return (
                      <div key={itinerary.id} className="p-2">
                        <button
                          onClick={() => handleSelectItinerary(itinerary.id)}
                          className={`group relative w-full rounded-2xl p-4 text-left transition-all duration-300 ${
                            isSelected
                              ? "bg-blue-50 dark:bg-blue-900/20 shadow-sm ring-1 ring-blue-100 dark:ring-blue-800/50"
                              : "hover:bg-gray-50 dark:hover:bg-gray-800/40"
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <h3
                                className={`truncate text-sm font-bold tracking-tight ${
                                  isSelected
                                    ? "text-blue-900 dark:text-blue-100"
                                    : "text-gray-900 dark:text-white"
                                }`}
                              >
                                {itinerary.title}
                              </h3>
                            </div>

                            <p className="mt-1 text-[12px] font-medium text-gray-500 dark:text-gray-400">
                              {formatDateRange(
                                itinerary.start_date,
                                itinerary.end_date
                              )}
                            </p>

                            <div className="mt-3 flex items-center justify-between gap-2">
                              <div className="flex -space-x-2">
                                {[...Array(Math.min(travelerTotal, 3))].map(
                                  (_, i) => (
                                    <div
                                      key={i}
                                      className="h-6 w-6 rounded-full border-2 border-white bg-gray-200 dark:border-gray-900 dark:bg-gray-700"
                                    />
                                  )
                                )}
                                {travelerTotal > 3 && (
                                  <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-gray-100 text-[10px] font-bold text-gray-500 dark:border-gray-900 dark:bg-gray-800">
                                    +{travelerTotal - 3}
                                  </div>
                                )}
                              </div>
                              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                                {itinerary.visibility}
                              </span>
                            </div>
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </aside>

        <div className="space-y-6">
          {detailLoading && (
            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-6 text-sm text-gray-500 dark:text-gray-400">
              Syncing the itinerary workspace...
            </div>
          )}

          {!detailLoading && !detail && (
            <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm p-10 text-center text-sm text-gray-500 dark:text-gray-400">
              {selectedSummary
                ? "We couldn’t load the itinerary details. Try refreshing."
                : "Select an itinerary to see the collaboration workspace."}
            </div>
          )}

          {detail && (
            <div className="space-y-6">
              {editingSegmentId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                  <div
                    className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                    onClick={() => setEditingSegmentId(null)}
                  />
                  <div className="relative w-full max-w-4xl lg:max-w-5xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200 dark:border-gray-800">
                    <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 px-8 py-5 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Edit Segment
                      </h3>
                      <button
                        type="button"
                        onClick={() => setEditingSegmentId(null)}
                        className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-gray-800 transition"
                      >
                        <svg
                          className="h-5 w-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={1.5}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                    <form
                      onSubmit={handleUpdateSegment}
                      className="p-6 lg:p-8 space-y-6"
                    >
                      {editSmartFillSupported && (
                        <div className="rounded-2xl border border-dashed border-blue-200/70 dark:border-blue-800/70 bg-blue-50/50 dark:bg-blue-900/10 p-4 space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                                Smart fill
                              </p>
                              <p className="text-xs text-blue-700/80 dark:text-blue-200/70">
                                Use free data sources to pre-fill this segment,
                                then tweak anything.
                              </p>
                            </div>
                            {editSmartFillSuggestion && (
                              <button
                                type="button"
                                onClick={clearEditSmartFillSuggestion}
                                className="text-xs font-semibold text-blue-700 hover:text-blue-900 dark:text-blue-300"
                              >
                                Clear
                              </button>
                            )}
                          </div>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <input
                              type="text"
                              value={editSmartFillInput}
                              onChange={(event) =>
                                setEditSmartFillInput(event.target.value)
                              }
                              placeholder={editSmartFillPlaceholder}
                              className="w-full rounded-lg border border-blue-200/70 dark:border-blue-800/70 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <div className="flex gap-2">
                              <input
                                type="date"
                                value={editSmartFillDate}
                                onChange={(event) =>
                                  setEditSmartFillDate(event.target.value)
                                }
                                className="flex-1 rounded-lg border border-blue-200/70 dark:border-blue-800/70 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                              <button
                                type="button"
                                onClick={handleEditSmartFill}
                                disabled={editSmartFillLoading}
                                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                              >
                                {editSmartFillLoading
                                  ? "Filling..."
                                  : "Auto fill"}
                              </button>
                            </div>
                          </div>
                          {editSmartFillError && (
                            <p className="text-xs font-semibold text-red-600 dark:text-red-400">
                              {editSmartFillError}
                            </p>
                          )}
                          {editSmartFillSuggestion && (
                            <div className="rounded-xl border border-blue-200/70 dark:border-blue-800/70 bg-white/80 dark:bg-gray-900/40 px-3 py-3">
                              <p className="text-xs font-semibold text-blue-900 dark:text-blue-100">
                                Filled via{" "}
                                {editSmartFillSuggestion.source ?? "smart fill"}
                              </p>
                              {editSmartFillSuggestion.highlights?.length ? (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {editSmartFillSuggestion.highlights!.map(
                                    (highlight) => (
                                      <span
                                        key={`${highlight.label}-${highlight.value}`}
                                        className="inline-flex items-center rounded-full bg-blue-100/70 px-2 py-0.5 text-[11px] font-semibold text-blue-800 dark:bg-blue-900/40 dark:text-blue-200"
                                      >
                                        <span className="mr-1 text-blue-500">
                                          ●
                                        </span>
                                        {highlight.label}: {highlight.value}
                                      </span>
                                    )
                                  )}
                                </div>
                              ) : (
                                <p className="mt-2 text-[11px] text-blue-900/70 dark:text-blue-200/70">
                                  We filled the available fields – you can still
                                  edit before saving.
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="space-y-6">
                        <div className="grid gap-3 md:grid-cols-3">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                              Type
                            </label>
                            <select
                              value={editSegmentForm.type}
                              onChange={(e) =>
                                setEditSegmentForm({
                                  ...editSegmentForm,
                                  type: e.target.value as SegmentType,
                                })
                              }
                              className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              {SEGMENT_TYPE_OPTIONS.map((t) => (
                                <option key={t.value} value={t.value}>
                                  {t.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                              Title
                            </label>
                            <input
                              type="text"
                              value={editSegmentForm.title}
                              onChange={(e) =>
                                setEditSegmentForm({
                                  ...editSegmentForm,
                                  title: e.target.value,
                                })
                              }
                              placeholder={editTitlePlaceholderText}
                              className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              required
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                              Cost (USD)
                            </label>
                            <div className="relative">
                              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm font-semibold text-gray-500 dark:text-gray-400">
                                $
                              </span>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={editSegmentForm.costAmount}
                                onChange={(e) =>
                                  setEditSegmentForm({
                                    ...editSegmentForm,
                                    costAmount: e.target.value,
                                  })
                                }
                                className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 pl-7 pr-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="0.00"
                              />
                            </div>
                          </div>
                        </div>

                        <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/60 dark:bg-gray-950/40 p-4 sm:p-5 space-y-4">
                          <div className="flex items-center justify-between">
                            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500">
                              Location & timing
                            </p>
                          </div>
                          <div className="space-y-4">
                            {editIsFlightSegment && (
                              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                                <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/40 px-4 py-4 space-y-3">
                                  <div className="flex items-center justify-between">
                                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500">
                                      Departure
                                    </p>
                                    <span className="text-[11px] text-gray-400 dark:text-gray-500">
                                      Takeoff details
                                    </span>
                                  </div>
                                  <div className="space-y-3">
                                    <div>
                                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Airport or city
                                      </label>
                                      <input
                                        type="text"
                                        value={editDepartureAirportValue}
                                        onChange={(e) =>
                                          handleEditEndpointFieldChange(
                                            "departure",
                                            "airport",
                                            e.target.value
                                          )
                                        }
                                        className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="e.g., SFO · International"
                                      />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                      <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                          Terminal
                                        </label>
                                        <input
                                          type="text"
                                          value={editDepartureTerminalValue}
                                          onChange={(e) =>
                                            handleEditEndpointFieldChange(
                                              "departure",
                                              "terminal",
                                              e.target.value
                                            )
                                          }
                                          className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                          placeholder="Terminal / concourse"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                          Gate
                                        </label>
                                        <input
                                          type="text"
                                          value={editDepartureGateValue}
                                          onChange={(e) =>
                                            handleEditEndpointFieldChange(
                                              "departure",
                                              "gate",
                                              e.target.value
                                            )
                                          }
                                          className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                          placeholder="Gate"
                                        />
                                      </div>
                                    </div>
                                    <div>
                                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Timezone
                                      </label>
                                      <input
                                        type="text"
                                        value={editDepartureTimezoneValue}
                                        onChange={(e) =>
                                          handleEditEndpointFieldChange(
                                            "departure",
                                            "timezone",
                                            e.target.value
                                          )
                                        }
                                        className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="America/Los_Angeles"
                                      />
                                    </div>
                                  </div>
                                </div>
                                <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/40 px-4 py-4 space-y-3">
                                  <div className="flex items-center justify-between">
                                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500">
                                      Arrival
                                    </p>
                                    <span className="text-[11px] text-gray-400 dark:text-gray-500">
                                      Landing details
                                    </span>
                                  </div>
                                  <div className="space-y-3">
                                    <div>
                                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Airport or city
                                      </label>
                                      <input
                                        type="text"
                                        value={editArrivalAirportValue}
                                        onChange={(e) =>
                                          handleEditEndpointFieldChange(
                                            "arrival",
                                            "airport",
                                            e.target.value
                                          )
                                        }
                                        className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="e.g., Haneda · Terminal 3"
                                      />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                      <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                          Terminal
                                        </label>
                                        <input
                                          type="text"
                                          value={editArrivalTerminalValue}
                                          onChange={(e) =>
                                            handleEditEndpointFieldChange(
                                              "arrival",
                                              "terminal",
                                              e.target.value
                                            )
                                          }
                                          className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                          placeholder="Terminal / customs"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                          Gate / carousel
                                        </label>
                                        <input
                                          type="text"
                                          value={editArrivalGateValue}
                                          onChange={(e) =>
                                            handleEditEndpointFieldChange(
                                              "arrival",
                                              "gate",
                                              e.target.value
                                            )
                                          }
                                          className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                          placeholder="Gate or belt"
                                        />
                                      </div>
                                    </div>
                                    <div>
                                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Timezone
                                      </label>
                                      <input
                                        type="text"
                                        value={editArrivalTimezoneValue}
                                        onChange={(e) =>
                                          handleEditEndpointFieldChange(
                                            "arrival",
                                            "timezone",
                                            e.target.value
                                          )
                                        }
                                        className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="Asia/Tokyo"
                                      />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                  Start time
                                </label>
                                <input
                                  type="datetime-local"
                                  value={editSegmentForm.startTime}
                                  onChange={(e) =>
                                    setEditSegmentForm({
                                      ...editSegmentForm,
                                      startTime: e.target.value,
                                    })
                                  }
                                  disabled={editSegmentForm.isAllDay}
                                  className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                  End time
                                </label>
                                <input
                                  type="datetime-local"
                                  value={editSegmentForm.endTime}
                                  onChange={(e) =>
                                    setEditSegmentForm({
                                      ...editSegmentForm,
                                      endTime: e.target.value,
                                    })
                                  }
                                  disabled={editSegmentForm.isAllDay}
                                  className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                            </div>
                          </div>
                        </section>

                        <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/60 dark:bg-gray-950/40 p-4 sm:p-5 space-y-4">
                          <div className="flex items-center justify-between">
                            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500">
                              Info
                            </p>
                          </div>
                          <div className="grid gap-3 md:grid-cols-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                {editProviderLabelText}
                              </label>
                              <input
                                type="text"
                                value={editSegmentForm.providerName}
                                onChange={(e) =>
                                  setEditSegmentForm({
                                    ...editSegmentForm,
                                    providerName: e.target.value,
                                  })
                                }
                                placeholder={editProviderPlaceholderText}
                                className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                {editConfirmationLabelText}
                              </label>
                              <input
                                type="text"
                                value={editSegmentForm.confirmationCode}
                                onChange={(e) =>
                                  setEditSegmentForm({
                                    ...editSegmentForm,
                                    confirmationCode: e.target.value,
                                  })
                                }
                                placeholder={editConfirmationPlaceholderText}
                                className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                            {editShowReferenceField && (
                              <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                  {editReferenceLabelText}
                                </label>
                                <input
                                  type="text"
                                  value={editSegmentForm.transportNumber}
                                  onChange={(e) =>
                                    setEditSegmentForm({
                                      ...editSegmentForm,
                                      transportNumber: e.target.value,
                                    })
                                  }
                                  placeholder={editReferencePlaceholderText}
                                  className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                            )}
                            {editShowSeatField && (
                              <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                  {editSeatLabelText}
                                </label>
                                <input
                                  type="text"
                                  value={editSegmentForm.seatInfo}
                                  onChange={(e) =>
                                    setEditSegmentForm({
                                      ...editSegmentForm,
                                      seatInfo: e.target.value,
                                    })
                                  }
                                  placeholder={editSeatPlaceholderText}
                                  className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                            )}
                          </div>
                        </section>
                      </div>
                      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-800">
                        <button
                          type="button"
                          onClick={() => setEditingSegmentId(null)}
                          className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={updatingSegment}
                          className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {updatingSegment ? "Saving..." : "Save Changes"}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              <div className="group relative rounded-[2rem] border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-xl shadow-gray-200/50 dark:shadow-none overflow-hidden transition-all duration-500">
                <div className="h-3 bg-gradient-to-r from-blue-600 to-indigo-600 w-full" />

                {isEditingHeader && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div
                      className="absolute inset-0 bg-black/60 backdrop-blur-md"
                      onClick={() => setIsEditingHeader(false)}
                    />
                    <div className="relative w-full max-w-3xl bg-white dark:bg-gray-900 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                      <div className="px-8 py-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-950/50">
                        <h3 className="text-xl font-black text-gray-900 dark:text-white">
                          Settings
                        </h3>
                        <button
                          onClick={() => setIsEditingHeader(false)}
                          className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                        >
                          <svg
                            className="h-5 w-5 text-gray-400"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </div>

                      <div className="flex-1 overflow-y-auto p-8 space-y-10">
                        {/* Visibility Section */}
                        <form
                          onSubmit={handleUpdateItinerary}
                          className="space-y-6"
                        >
                          <div>
                            <label className="block text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">
                              Visibility & Privacy
                            </label>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              {["private", "shared", "public"].map((v) => (
                                <button
                                  key={v}
                                  type="button"
                                  onClick={() =>
                                    setEditHeaderForm({
                                      ...editHeaderForm,
                                      visibility: v,
                                    })
                                  }
                                  className={`p-4 rounded-2xl border-2 text-left transition-all ${
                                    editHeaderForm.visibility === v
                                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/10"
                                      : "border-gray-100 dark:border-gray-800 hover:border-gray-200"
                                  }`}
                                >
                                  <p className="font-bold text-gray-900 dark:text-white capitalize mb-1">
                                    {v}
                                  </p>
                                  <p className="text-[10px] text-gray-500">
                                    {v === "private" && "Only travelers"}
                                    {v === "shared" && "Connections only"}
                                    {v === "public" && "Visible to everyone"}
                                  </p>
                                </button>
                              ))}
                            </div>
                          </div>
                        </form>

                        <div className="border-t border-gray-100 dark:border-gray-800" />

                        {/* Participants Section */}
                        <div className="space-y-6">
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="font-bold text-gray-900 dark:text-white">
                                Participants
                              </h4>
                              <p className="text-xs text-gray-500">
                                Collaborate with others on this journey
                              </p>
                            </div>
                            <button className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition">
                              Invite +
                            </button>
                          </div>

                          <div className="divide-y divide-gray-50 dark:divide-gray-800 border border-gray-100 dark:border-gray-800 rounded-2xl overflow-hidden">
                            {detail.travelers?.map((traveler, index) => {
                              const displayName = travelerDisplayName(
                                traveler,
                                usersById
                              );
                              return (
                                <div
                                  key={index}
                                  className="px-5 py-4 flex items-center justify-between bg-white dark:bg-gray-900/50"
                                >
                                  <div className="flex items-center gap-3">
                                    <div
                                      className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-600"
                                      style={{
                                        background:
                                          traveler.color_hex || undefined,
                                      }}
                                    >
                                      {avatarInitials(displayName)}
                                    </div>
                                    <div>
                                      <p className="text-sm font-bold text-gray-900 dark:text-white">
                                        {displayName}
                                      </p>
                                      <p className="text-[10px] uppercase font-black text-gray-400">
                                        {traveler.role}
                                      </p>
                                    </div>
                                  </div>
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-50 dark:bg-gray-800 text-gray-500 uppercase">
                                    {traveler.invitation_status}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <div className="flex justify-end gap-4 pt-4">
                          <button
                            type="button"
                            onClick={() => setIsEditingHeader(false)}
                            className="px-6 py-3 text-sm font-bold text-gray-500 hover:text-gray-900"
                          >
                            Close
                          </button>
                          <button
                            onClick={() => handleUpdateItinerary()}
                            disabled={updatingHeader}
                            className="px-8 py-3 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-700 disabled:opacity-50"
                          >
                            {updatingHeader ? "Saving..." : "Save Settings"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="p-8 lg:p-10 relative">
                  <div className="absolute top-8 right-8 lg:top-10 lg:right-10">
                    <button
                      onClick={startEditingHeader}
                      className="p-3 rounded-full bg-gray-50/50 dark:bg-gray-800/50 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all duration-300 shadow-sm border border-gray-100 dark:border-gray-800 backdrop-blur-sm"
                      aria-label="Itinerary settings"
                    >
                      <svg
                        className="h-6 w-6"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      </svg>
                    </button>
                  </div>

                  <div className="mb-8 pr-16">
                    {isEditingTitle ? (
                      <div className="flex-1 min-w-0 pr-4">
                        <input
                          type="text"
                          autoFocus
                          value={editHeaderForm.title}
                          onChange={(e) =>
                            setEditHeaderForm({
                              ...editHeaderForm,
                              title: e.target.value,
                            })
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleUpdateItinerary();
                            if (e.key === "Escape") setIsEditingTitle(false);
                          }}
                          onBlur={() => {
                            if (editHeaderForm.title === detail.title)
                              setIsEditingTitle(false);
                          }}
                          className="w-full bg-gray-50 dark:bg-gray-800/50 text-4xl font-black text-gray-900 dark:text-white px-4 py-2 rounded-2xl border-2 border-blue-500/20 focus:border-blue-500 focus:outline-none transition-all"
                        />
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => handleUpdateItinerary()}
                            className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs font-bold shadow-lg"
                          >
                            {updatingHeader ? "Saving..." : "Save"}
                          </button>
                          <button
                            onClick={() => setIsEditingTitle(false)}
                            className="px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg text-xs font-bold"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="group/title relative inline-block">
                        <h2
                          className="text-4xl font-black text-gray-900 dark:text-white tracking-tight cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-all flex items-center gap-3"
                          onClick={() => {
                            if (detail.owner_id === userId) {
                              setEditHeaderForm({
                                title: detail.title || "",
                                visibility: detail.visibility || "private",
                              });
                              setIsEditingTitle(true);
                            }
                          }}
                        >
                          {detail.title}
                          {detail.owner_id === userId && (
                            <svg
                              className="h-6 w-6 opacity-0 group-hover/title:opacity-100 transition-opacity text-blue-500"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2.5}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                              />
                            </svg>
                          )}
                        </h2>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-col gap-1">
                      <p className="flex items-center gap-2 text-lg font-semibold text-gray-700 dark:text-gray-300">
                        <svg
                          className="h-5 w-5 text-blue-500"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                        {formatDateRange(
                          inferredDates.start,
                          inferredDates.end
                        )}
                      </p>
                      <p className="text-sm font-medium text-gray-400 dark:text-gray-500 ml-7">
                        {tripDurationLabel}
                      </p>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 p-0.5 shadow-lg shadow-blue-500/20">
                          <div className="h-full w-full rounded-full bg-white dark:bg-gray-900 flex items-center justify-center font-bold text-blue-600 dark:text-blue-400">
                            {avatarInitials(
                              detail.owner?.preferred_name ||
                                detail.owner?.name,
                              detail.owner?.username
                            )}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                            Host
                          </p>
                          <p className="text-sm font-bold text-gray-900 dark:text-white">
                            {detail.owner?.preferred_name ||
                              detail.owner?.name ||
                              detail.owner?.username ||
                              "Owner"}
                          </p>
                        </div>
                      </div>

                      <div className="h-10 w-px bg-gray-100 dark:bg-gray-800" />

                      <div className="flex gap-6">
                        <div className="text-center">
                          <p className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                            Travelers
                          </p>
                          <p className="text-lg font-black text-gray-900 dark:text-white leading-tight">
                            {travelerCount}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                            Segments
                          </p>
                          <p className="text-lg font-black text-gray-900 dark:text-white leading-tight">
                            {segmentCount}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-gray-100 dark:border-gray-800">
                  <div className="px-8 lg:px-10 py-6 flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Trip Timeline
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {segmentCount} segment{segmentCount === 1 ? "" : "s"}{" "}
                        planned
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowSegmentForm(true)}
                      className="rounded-full bg-blue-600 text-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-blue-700 transition flex items-center gap-2"
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 4v16m8-8H4"
                        />
                      </svg>
                      Add segment
                    </button>
                  </div>

                  {showSegmentForm && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                      <div
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        onClick={closeSegmentModal}
                      />
                      <div className="relative w-full max-w-4xl lg:max-w-5xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200 dark:border-gray-800">
                        <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 px-8 py-5 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                            Add New Segment
                          </h3>
                          <button
                            type="button"
                            onClick={closeSegmentModal}
                            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-gray-800 transition"
                          >
                            <svg
                              className="h-5 w-5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={1.5}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          </button>
                        </div>
                        <form
                          onSubmit={handleCreateSegment}
                          className="p-6 lg:p-8 space-y-6"
                        >
                          {smartFillSupported && (
                            <>
                              {/* Smart Fill */}
                              <div className="rounded-2xl border border-dashed border-blue-200/70 dark:border-blue-800/70 bg-blue-50/50 dark:bg-blue-900/10 p-4 space-y-3">
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                                      Smart fill
                                    </p>
                                    <p className="text-xs text-blue-700/80 dark:text-blue-200/70">
                                      Use free data sources to pre-fill this
                                      segment, then tweak anything.
                                    </p>
                                  </div>
                                  {smartFillSuggestion && (
                                    <button
                                      type="button"
                                      onClick={clearSmartFillSuggestion}
                                      className="text-xs font-semibold text-blue-700 hover:text-blue-900 dark:text-blue-300"
                                    >
                                      Clear
                                    </button>
                                  )}
                                </div>
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                  <input
                                    type="text"
                                    value={smartFillInput}
                                    onChange={(event) =>
                                      setSmartFillInput(event.target.value)
                                    }
                                    placeholder={smartFillPlaceholder}
                                    className="w-full rounded-lg border border-blue-200/70 dark:border-blue-800/70 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  />
                                  <div className="flex gap-2">
                                    <input
                                      type="date"
                                      value={smartFillDate}
                                      onChange={(event) =>
                                        setSmartFillDate(event.target.value)
                                      }
                                      className="flex-1 rounded-lg border border-blue-200/70 dark:border-blue-800/70 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                    <button
                                      type="button"
                                      onClick={handleSmartFill}
                                      disabled={smartFillLoading}
                                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                                    >
                                      {smartFillLoading
                                        ? "Filling..."
                                        : "Auto fill"}
                                    </button>
                                  </div>
                                </div>
                                {smartFillError && (
                                  <p className="text-xs font-semibold text-red-600 dark:text-red-400">
                                    {smartFillError}
                                  </p>
                                )}
                                {smartFillSuggestion && (
                                  <div className="rounded-xl border border-blue-200/70 dark:border-blue-800/70 bg-white/80 dark:bg-gray-900/40 px-3 py-3">
                                    <p className="text-xs font-semibold text-blue-900 dark:text-blue-100">
                                      Filled via{" "}
                                      {smartFillSuggestion.source ??
                                        "smart fill"}
                                    </p>
                                    {smartFillSuggestion.highlights?.length ? (
                                      <div className="mt-2 flex flex-wrap gap-2">
                                        {smartFillSuggestion.highlights!.map(
                                          (highlight) => (
                                            <span
                                              key={`${highlight.label}-${highlight.value}`}
                                              className="inline-flex items-center rounded-full bg-blue-100/70 px-2 py-0.5 text-[11px] font-semibold text-blue-800 dark:bg-blue-900/40 dark:text-blue-200"
                                            >
                                              <span className="mr-1 text-blue-500">
                                                ●
                                              </span>
                                              {highlight.label}:{" "}
                                              {highlight.value}
                                            </span>
                                          )
                                        )}
                                      </div>
                                    ) : (
                                      <p className="mt-2 text-[11px] text-blue-900/70 dark:text-blue-200/70">
                                        We filled the available fields – you can
                                        still edit before saving.
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>
                            </>
                          )}

                          {/* Segment Type */}
                          <div className="grid gap-3 md:grid-cols-3">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Type
                              </label>
                              <select
                                value={segmentForm.type}
                                onChange={(event) =>
                                  setSegmentForm((prev) => ({
                                    ...prev,
                                    type: event.target.value as SegmentType,
                                  }))
                                }
                                className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              >
                                {SEGMENT_TYPE_OPTIONS.map((typeOption) => (
                                  <option
                                    key={typeOption.value}
                                    value={typeOption.value}
                                  >
                                    {typeOption.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="rounded-2xl dark:border-gray-700 px-4 text-xs text-gray-500 dark:text-gray-400">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                  Title
                                </label>
                                <input
                                  type="text"
                                  value={segmentForm.title}
                                  onChange={(e) =>
                                    setSegmentForm((prev) => ({
                                      ...prev,
                                      title: e.target.value,
                                    }))
                                  }
                                  className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  placeholder={titlePlaceholderText}
                                  required
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Cost (USD)
                              </label>
                              <div className="relative">
                                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm font-semibold text-gray-500 dark:text-gray-400">
                                  $
                                </span>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={segmentForm.costAmount}
                                  onChange={(e) =>
                                    setSegmentForm((prev) => ({
                                      ...prev,
                                      costAmount: e.target.value,
                                    }))
                                  }
                                  className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 pl-7 pr-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  placeholder="0.00"
                                />
                              </div>
                            </div>
                          </div>

                          <div className="space-y-5">
                            <div>
                              <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/60 dark:bg-gray-950/40 p-4 sm:p-5 space-y-4">
                                <div className="flex items-center justify-between">
                                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500">
                                    Location & timing
                                  </p>
                                </div>
                                <div className="space-y-4">
                                  {isFlightSegment && (
                                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                                      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/40 px-4 py-4 space-y-3">
                                        <div className="flex items-center justify-between">
                                          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500">
                                            Departure
                                          </p>
                                          <span className="text-[11px] text-gray-400 dark:text-gray-500">
                                            Takeoff details
                                          </span>
                                        </div>
                                        <div>
                                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Airport or city
                                          </label>
                                          <input
                                            type="text"
                                            value={departureAirportValue}
                                            onChange={(e) =>
                                              handleEndpointFieldChange(
                                                "departure",
                                                "airport",
                                                e.target.value
                                              )
                                            }
                                            className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            placeholder="e.g., SFO · International"
                                          />
                                        </div>
                                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                          <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                              Terminal
                                            </label>
                                            <input
                                              type="text"
                                              value={departureTerminalValue}
                                              onChange={(e) =>
                                                handleEndpointFieldChange(
                                                  "departure",
                                                  "terminal",
                                                  e.target.value
                                                )
                                              }
                                              className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                              placeholder="Terminal / concourse"
                                            />
                                          </div>
                                          <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                              Gate
                                            </label>
                                            <input
                                              type="text"
                                              value={departureGateValue}
                                              onChange={(e) =>
                                                handleEndpointFieldChange(
                                                  "departure",
                                                  "gate",
                                                  e.target.value
                                                )
                                              }
                                              className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                              placeholder="Gate"
                                            />
                                          </div>
                                        </div>
                                        <div>
                                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Timezone
                                          </label>
                                          <input
                                            type="text"
                                            value={departureTimezoneValue}
                                            onChange={(e) =>
                                              handleEndpointFieldChange(
                                                "departure",
                                                "timezone",
                                                e.target.value
                                              )
                                            }
                                            className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            placeholder="America/Los_Angeles"
                                          />
                                        </div>
                                      </div>
                                      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/40 px-4 py-4 space-y-3">
                                        <div className="flex items-center justify-between">
                                          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500">
                                            Arrival
                                          </p>
                                          <span className="text-[11px] text-gray-400 dark:text-gray-500">
                                            Landing details
                                          </span>
                                        </div>
                                        <div>
                                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Airport or city
                                          </label>
                                          <input
                                            type="text"
                                            value={arrivalAirportValue}
                                            onChange={(e) =>
                                              handleEndpointFieldChange(
                                                "arrival",
                                                "airport",
                                                e.target.value
                                              )
                                            }
                                            className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            placeholder="e.g., Haneda · Terminal 3"
                                          />
                                        </div>
                                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                          <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                              Terminal
                                            </label>
                                            <input
                                              type="text"
                                              value={arrivalTerminalValue}
                                              onChange={(e) =>
                                                handleEndpointFieldChange(
                                                  "arrival",
                                                  "terminal",
                                                  e.target.value
                                                )
                                              }
                                              className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                              placeholder="Terminal / customs"
                                            />
                                          </div>
                                          <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                              Gate / carousel
                                            </label>
                                            <input
                                              type="text"
                                              value={arrivalGateValue}
                                              onChange={(e) =>
                                                handleEndpointFieldChange(
                                                  "arrival",
                                                  "gate",
                                                  e.target.value
                                                )
                                              }
                                              className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                              placeholder="Gate or belt"
                                            />
                                          </div>
                                        </div>
                                        <div>
                                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Timezone
                                          </label>
                                          <input
                                            type="text"
                                            value={arrivalTimezoneValue}
                                            onChange={(e) =>
                                              handleEndpointFieldChange(
                                                "arrival",
                                                "timezone",
                                                e.target.value
                                              )
                                            }
                                            className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            placeholder="Asia/Tokyo"
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <div>
                                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Start
                                      </label>
                                      <input
                                        type="datetime-local"
                                        value={segmentForm.startTime}
                                        onChange={(e) =>
                                          setSegmentForm((prev) => ({
                                            ...prev,
                                            startTime: e.target.value,
                                          }))
                                        }
                                        disabled={segmentForm.isAllDay}
                                        className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        End
                                      </label>
                                      <input
                                        type="datetime-local"
                                        value={segmentForm.endTime}
                                        onChange={(e) =>
                                          setSegmentForm((prev) => ({
                                            ...prev,
                                            endTime: e.target.value,
                                          }))
                                        }
                                        disabled={segmentForm.isAllDay}
                                        className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                                      />
                                    </div>
                                  </div>
                                  {/* <div className="flex flex-col gap-2">
                                    <div>
                                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Timezone
                                      </label>
                                      <input
                                        type="text"
                                        value={segmentForm.timezone}
                                        onChange={(e) =>
                                          setSegmentForm((prev) => ({
                                            ...prev,
                                            timezone: e.target.value,
                                          }))
                                        }
                                        className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="e.g., Asia/Tokyo"
                                      />
                                    </div>
                                  </div> */}
                                </div>
                              </section>
                            </div>

                            <div className="grid gap-5">
                              <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/60 dark:bg-gray-950/40 p-4 sm:p-5 space-y-4">
                                <div className="flex items-center justify-between">
                                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500">
                                    Info
                                  </p>
                                </div>
                                <div
                                  className={`grid grid-cols-1 gap-3 sm:grid-cols-${cols}`}
                                >
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                      {providerLabelText}
                                    </label>
                                    <input
                                      type="text"
                                      value={segmentForm.providerName}
                                      onChange={(e) =>
                                        setSegmentForm((prev) => ({
                                          ...prev,
                                          providerName: e.target.value,
                                        }))
                                      }
                                      className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                      placeholder={providerPlaceholderText}
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                      {confirmationLabelText}
                                    </label>
                                    <input
                                      type="text"
                                      value={segmentForm.confirmationCode}
                                      onChange={(e) =>
                                        setSegmentForm((prev) => ({
                                          ...prev,
                                          confirmationCode: e.target.value,
                                        }))
                                      }
                                      className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                      placeholder={confirmationPlaceholderText}
                                    />
                                  </div>
                                  {showReferenceField && (
                                    <div>
                                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        {referenceLabelText}
                                      </label>
                                      <input
                                        type="text"
                                        value={segmentForm.transportNumber}
                                        onChange={(e) =>
                                          setSegmentForm((prev) => ({
                                            ...prev,
                                            transportNumber: e.target.value,
                                          }))
                                        }
                                        className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder={referencePlaceholderText}
                                      />
                                    </div>
                                  )}
                                  {showSeatField && (
                                    <div>
                                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        {seatLabelText}
                                      </label>
                                      <input
                                        type="text"
                                        value={segmentForm.seatInfo}
                                        onChange={(e) =>
                                          setSegmentForm((prev) => ({
                                            ...prev,
                                            seatInfo: e.target.value,
                                          }))
                                        }
                                        className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder={seatPlaceholderText}
                                      />
                                    </div>
                                  )}
                                </div>
                              </section>
                            </div>

                            {showLegsEditor && (
                              <section className="rounded-2xl border border-blue-200/70 dark:border-blue-800/60 bg-blue-50/50 dark:bg-blue-900/10 p-4 sm:p-5">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <div>
                                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-blue-500">
                                      Legs & hops
                                    </p>
                                    <p className="text-sm text-blue-700 dark:text-blue-200">
                                      Track each hop for train transfers.
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setLegsExpanded((prev) => !prev)
                                      }
                                      className="inline-flex items-center rounded-xl border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 shadow-sm hover:bg-blue-50 dark:bg-blue-900/30 dark:text-blue-100"
                                    >
                                      {legsExpanded ? "Collapse" : "Expand"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={handleCreateLegAdd}
                                      className="inline-flex items-center rounded-xl border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 shadow-sm hover:bg-blue-50 dark:bg-blue-900/30 dark:text-blue-100"
                                    >
                                      + Add leg
                                    </button>
                                  </div>
                                </div>
                                {legsExpanded && (
                                  <div className="mt-4 space-y-4">
                                    {segmentForm.legs.length === 0 ? (
                                      <div className="rounded-2xl border border-dashed border-blue-200/80 dark:border-blue-800/60 bg-white dark:bg-gray-950/70 p-6 text-center text-sm text-blue-600 dark:text-blue-200">
                                        No legs yet — add hops to keep
                                        connections clear.
                                      </div>
                                    ) : (
                                      segmentForm.legs.map((leg, index) => (
                                        <div
                                          key={leg.id}
                                          className="rounded-2xl border border-blue-200/70 dark:border-blue-800/60 bg-white dark:bg-gray-950/70 p-4 space-y-3"
                                        >
                                          <div className="flex items-center justify-between">
                                            <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                              Leg {index + 1}
                                            </p>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                handleCreateLegRemove(leg.id)
                                              }
                                              disabled={
                                                segmentForm.legs.length === 1
                                              }
                                              className="text-xs font-semibold text-red-500 disabled:text-gray-400"
                                            >
                                              Remove
                                            </button>
                                          </div>
                                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                            <div>
                                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                                                Origin
                                              </label>
                                              <input
                                                type="text"
                                                value={leg.origin}
                                                onChange={(e) =>
                                                  handleCreateLegChange(
                                                    leg.id,
                                                    "origin",
                                                    e.target.value
                                                  )
                                                }
                                                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                placeholder="Airport or station"
                                              />
                                            </div>
                                            <div>
                                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                                                Destination
                                              </label>
                                              <input
                                                type="text"
                                                value={leg.destination}
                                                onChange={(e) =>
                                                  handleCreateLegChange(
                                                    leg.id,
                                                    "destination",
                                                    e.target.value
                                                  )
                                                }
                                                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                placeholder="Airport or station"
                                              />
                                            </div>
                                          </div>
                                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                            <div>
                                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                                                Departure
                                              </label>
                                              <input
                                                type="datetime-local"
                                                value={leg.departureTime}
                                                onChange={(e) =>
                                                  handleCreateLegChange(
                                                    leg.id,
                                                    "departureTime",
                                                    e.target.value
                                                  )
                                                }
                                                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                              />
                                            </div>
                                            <div>
                                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                                                Arrival
                                              </label>
                                              <input
                                                type="datetime-local"
                                                value={leg.arrivalTime}
                                                onChange={(e) =>
                                                  handleCreateLegChange(
                                                    leg.id,
                                                    "arrivalTime",
                                                    e.target.value
                                                  )
                                                }
                                                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                              />
                                            </div>
                                          </div>
                                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                            <div>
                                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                                                Carrier
                                              </label>
                                              <input
                                                type="text"
                                                value={leg.carrier}
                                                onChange={(e) =>
                                                  handleCreateLegChange(
                                                    leg.id,
                                                    "carrier",
                                                    e.target.value
                                                  )
                                                }
                                                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                placeholder="Airline / rail"
                                              />
                                            </div>
                                            <div>
                                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                                                Number
                                              </label>
                                              <input
                                                type="text"
                                                value={leg.number}
                                                onChange={(e) =>
                                                  handleCreateLegChange(
                                                    leg.id,
                                                    "number",
                                                    e.target.value
                                                  )
                                                }
                                                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                placeholder="UA 120"
                                              />
                                            </div>
                                            <div>
                                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                                                Seat
                                              </label>
                                              <input
                                                type="text"
                                                value={leg.seat}
                                                onChange={(e) =>
                                                  handleCreateLegChange(
                                                    leg.id,
                                                    "seat",
                                                    e.target.value
                                                  )
                                                }
                                                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                placeholder="12A"
                                              />
                                            </div>
                                          </div>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                )}
                              </section>
                            )}
                          </div>

                          {/* Submit */}
                          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-800">
                            <button
                              type="button"
                              onClick={closeSegmentModal}
                              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              disabled={creatingSegment}
                              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {creatingSegment ? "Adding..." : "Add Segment"}
                            </button>
                          </div>
                        </form>
                      </div>
                    </div>
                  )}

                  <div className="px-8 lg:px-10 pb-8">
                    {!segmentCount && (
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="h-16 w-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
                          <svg
                            className="h-8 w-8 text-gray-400 dark:text-gray-500"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={1.5}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
                            />
                          </svg>
                        </div>
                        <p className="text-base font-medium text-gray-900 dark:text-white">
                          Start building your itinerary
                        </p>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-sm">
                          Add flights, hotels, activities, and more. Each
                          segment becomes a node on your timeline.
                        </p>
                      </div>
                    )}

                    {segmentCount > 0 && (
                      <div className="relative">
                        <div className="pointer-events-none absolute left-12 top-6 bottom-6 w-0.5 bg-gradient-to-b from-blue-500 via-blue-400 to-blue-300 dark:from-blue-600 dark:via-blue-500 dark:to-blue-400" />

                        <div className="rounded-[1.75rem] border border-gray-200 dark:border-gray-800 bg-gradient-to-b from-white via-gray-50 to-gray-100/60 dark:from-gray-950 dark:via-gray-900/40 dark:to-gray-900/10 shadow-inner">
                          {detail.segments?.map((segment, index) => {
                            const isFirst = index === 0;
                            const isLast =
                              index === (detail.segments?.length ?? 0) - 1;
                            const isEven = index % 2 === 0;
                            const typeConfig: Record<
                              string,
                              {
                                icon: React.ReactNode;
                                color: string;
                                bgColor: string;
                              }
                            > = {
                              flight: {
                                icon: (
                                  <svg
                                    className="h-5 w-5"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={1.5}
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
                                    />
                                  </svg>
                                ),
                                color: "text-sky-600 dark:text-sky-400",
                                bgColor: "bg-sky-100 dark:bg-sky-900/40",
                              },
                              hotel: {
                                icon: (
                                  <svg
                                    className="h-5 w-5"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={1.5}
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z"
                                    />
                                  </svg>
                                ),
                                color: "text-purple-600 dark:text-purple-400",
                                bgColor: "bg-purple-100 dark:bg-purple-900/40",
                              },
                              activity: {
                                icon: (
                                  <svg
                                    className="h-5 w-5"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={1.5}
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
                                    />
                                  </svg>
                                ),
                                color: "text-amber-600 dark:text-amber-400",
                                bgColor: "bg-amber-100 dark:bg-amber-900/40",
                              },
                              transport: {
                                icon: (
                                  <svg
                                    className="h-5 w-5"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={1.5}
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12"
                                    />
                                  </svg>
                                ),
                                color: "text-green-600 dark:text-green-400",
                                bgColor: "bg-green-100 dark:bg-green-900/40",
                              },
                              meal: {
                                icon: (
                                  <svg
                                    className="h-5 w-5"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={1.5}
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v2.513m6-4.87c1.355 0 2.697.055 4.024.165C17.155 8.51 18 9.473 18 10.608v2.513m-3-4.87v-1.5m-6 1.5v-1.5m12 9.75l-1.5.75a3.354 3.354 0 01-3 0 3.354 3.354 0 00-3 0 3.354 3.354 0 01-3 0 3.354 3.354 0 00-3 0 3.354 3.354 0 01-3 0L3 16.5m15-3.38a48.474 48.474 0 00-6-.37c-2.032 0-4.034.125-6 .37m12 0c.39.049.777.102 1.163.16 1.07.16 1.837 1.094 1.837 2.175v5.17c0 .62-.504 1.124-1.125 1.124H4.125A1.125 1.125 0 013 20.625v-5.17c0-1.08.768-2.014 1.837-2.174A47.78 47.78 0 016 13.12M12.265 3.11a.375.375 0 11-.53 0L12 2.845l.265.265zm-3 0a.375.375 0 11-.53 0L9 2.845l.265.265zm6 0a.375.375 0 11-.53 0L15 2.845l.265.265z"
                                    />
                                  </svg>
                                ),
                                color: "text-rose-600 dark:text-rose-400",
                                bgColor: "bg-rose-100 dark:bg-rose-900/40",
                              },
                            };
                            const config = typeConfig[
                              segment.type.toLowerCase()
                            ] || {
                              icon: (
                                <svg
                                  className="h-5 w-5"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={1.5}
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
                                  />
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
                                  />
                                </svg>
                              ),
                              color: "text-blue-600 dark:text-blue-400",
                              bgColor: "bg-blue-100 dark:bg-blue-900/40",
                            };
                            const typeLabel =
                              getTypeConfig(segment.type).label || segment.type;

                            const costDisplay = getSegmentCostDisplay(segment);
                            return (
                              <div
                                key={segment.id}
                                className={`group relative pl-24 pr-8 py-8 transition-colors ${
                                  !isLast
                                    ? "border-b border-white/60 dark:border-gray-800/70"
                                    : ""
                                } ${
                                  isEven
                                    ? "bg-white/80 dark:bg-gray-900/30"
                                    : "bg-white/60 dark:bg-gray-900/10"
                                }`}
                              >
                                <div
                                  className={`absolute left-8 top-8 w-8 h-8 rounded-full ${config.bgColor} ${config.color} flex items-center justify-center ring-4 ring-white dark:ring-gray-900 shadow-sm`}
                                >
                                  {config.icon}
                                </div>

                                {/* Content */}
                                <div className="flex flex-col gap-4">
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex flex-wrap items-center gap-2 mb-1">
                                        <span
                                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${config.bgColor} ${config.color}`}
                                        >
                                          {typeLabel}
                                        </span>
                                        {segment.confirmation_code && (
                                          <span className="text-xs text-gray-400 dark:text-gray-500">
                                            #{segment.confirmation_code}
                                          </span>
                                        )}
                                      </div>
                                      <h4 className="text-base font-semibold text-gray-900 dark:text-white truncate">
                                        {segment.title}
                                      </h4>
                                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                        {formatSegmentTime(segment)}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      {costDisplay && (
                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg px-2 py-1">
                                          {costDisplay}
                                        </span>
                                      )}
                                      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                        {detail.owner_id === userId && (
                                          <>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                startEditingSegment(segment)
                                              }
                                              className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:text-blue-400 dark:hover:bg-blue-900/30 transition"
                                              title="Edit segment"
                                            >
                                              <svg
                                                className="h-4 w-4"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                                strokeWidth={2}
                                              >
                                                <path
                                                  strokeLinecap="round"
                                                  strokeLinejoin="round"
                                                  d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
                                                />
                                              </svg>
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                handleDeleteSegment(segment.id)
                                              }
                                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/30 transition"
                                              title="Delete segment"
                                            >
                                              <svg
                                                className="h-4 w-4"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                                strokeWidth={2}
                                              >
                                                <path
                                                  strokeLinecap="round"
                                                  strokeLinejoin="round"
                                                  d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                                                />
                                              </svg>
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  {(segment.provider_name ||
                                    segment.transport_number) && (
                                    <div className="flex flex-wrap gap-2">
                                      {segment.provider_name && (
                                        <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-lg px-2 py-1">
                                          <svg
                                            className="h-3 w-3"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                            strokeWidth={1.5}
                                          >
                                            <path
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z"
                                            />
                                          </svg>
                                          {segment.provider_name}
                                        </span>
                                      )}
                                      {segment.transport_number && (
                                        <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-lg px-2 py-1">
                                          <svg
                                            className="h-3 w-3"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                            strokeWidth={1.5}
                                          >
                                            <path
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              d="M5.25 8.25h15m-16.5 7.5h15m-1.8-13.5l-3.9 19.5m-2.1-19.5l-3.9 19.5"
                                            />
                                          </svg>
                                          {segment.transport_number}
                                        </span>
                                      )}
                                    </div>
                                  )}

                                  {(() => {
                                    const flightDetails =
                                      formatFlightDetails(segment);
                                    if (!flightDetails) return null;
                                    const { departure, arrival } =
                                      flightDetails;
                                    const hasDepDetails =
                                      departure.airport ||
                                      departure.terminal ||
                                      departure.gate ||
                                      departure.timezone;
                                    const hasArrDetails =
                                      arrival.airport ||
                                      arrival.terminal ||
                                      arrival.gate ||
                                      arrival.timezone;
                                    if (!hasDepDetails && !hasArrDetails)
                                      return null;

                                    return (
                                      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gradient-to-br from-blue-50/50 to-white dark:from-blue-900/10 dark:to-gray-900/30 p-4 space-y-3">
                                        {hasDepDetails && (
                                          <div className="space-y-1">
                                            <p className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-1">
                                              <svg
                                                className="h-3 w-3"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                                strokeWidth={2}
                                              >
                                                <path
                                                  strokeLinecap="round"
                                                  strokeLinejoin="round"
                                                  d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"
                                                />
                                              </svg>
                                              Departure
                                            </p>
                                            <div className="flex flex-wrap gap-2">
                                              {departure.airport && (
                                                <a
                                                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                                                    departure.airport
                                                  )}`}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="inline-flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800/80 rounded-lg px-2.5 py-1 border border-gray-200 dark:border-gray-700 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors cursor-pointer"
                                                >
                                                  <svg
                                                    className="h-3 w-3 text-blue-500"
                                                    fill="none"
                                                    viewBox="0 0 24 24"
                                                    stroke="currentColor"
                                                    strokeWidth={2}
                                                  >
                                                    <path
                                                      strokeLinecap="round"
                                                      strokeLinejoin="round"
                                                      d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
                                                    />
                                                    <path
                                                      strokeLinecap="round"
                                                      strokeLinejoin="round"
                                                      d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
                                                    />
                                                  </svg>
                                                  {departure.airport}
                                                </a>
                                              )}
                                              {departure.terminal && (
                                                <span className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800/80 rounded-lg px-2.5 py-1 border border-gray-200 dark:border-gray-700">
                                                  Terminal {departure.terminal}
                                                </span>
                                              )}
                                              {departure.gate && (
                                                <span className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800/80 rounded-lg px-2.5 py-1 border border-gray-200 dark:border-gray-700">
                                                  Gate {departure.gate}
                                                </span>
                                              )}
                                              {departure.timezone && (
                                                <span className="inline-flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-500 bg-gray-100 dark:bg-gray-900/50 rounded px-1.5 py-0.5">
                                                  {departure.timezone}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        )}
                                        {hasArrDetails && (
                                          <div className="space-y-1">
                                            <p className="text-[10px] font-black uppercase tracking-wider text-green-600 dark:text-green-400 flex items-center gap-1">
                                              <svg
                                                className="h-3 w-3"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                                strokeWidth={2}
                                              >
                                                <path
                                                  strokeLinecap="round"
                                                  strokeLinejoin="round"
                                                  d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
                                                />
                                              </svg>
                                              Arrival
                                            </p>
                                            <div className="flex flex-wrap gap-2">
                                              {arrival.airport && (
                                                <a
                                                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                                                    arrival.airport
                                                  )}`}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="inline-flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800/80 rounded-lg px-2.5 py-1 border border-gray-200 dark:border-gray-700 hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors cursor-pointer"
                                                >
                                                  <svg
                                                    className="h-3 w-3 text-green-500"
                                                    fill="none"
                                                    viewBox="0 0 24 24"
                                                    stroke="currentColor"
                                                    strokeWidth={2}
                                                  >
                                                    <path
                                                      strokeLinecap="round"
                                                      strokeLinejoin="round"
                                                      d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
                                                    />
                                                    <path
                                                      strokeLinecap="round"
                                                      strokeLinejoin="round"
                                                      d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
                                                    />
                                                  </svg>
                                                  {arrival.airport}
                                                </a>
                                              )}
                                              {arrival.terminal && (
                                                <span className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800/80 rounded-lg px-2.5 py-1 border border-gray-200 dark:border-gray-700">
                                                  Terminal {arrival.terminal}
                                                </span>
                                              )}
                                              {arrival.gate && (
                                                <span className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800/80 rounded-lg px-2.5 py-1 border border-gray-200 dark:border-gray-700">
                                                  Gate {arrival.gate}
                                                </span>
                                              )}
                                              {arrival.timezone && (
                                                <span className="inline-flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-500 bg-gray-100 dark:bg-gray-900/50 rounded px-1.5 py-0.5">
                                                  {arrival.timezone}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })()}

                                  <details className="rounded-2xl border border-dashed border-gray-200 dark:border-gray-800 bg-white/40 dark:bg-transparent">
                                    <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center justify-between">
                                      <span className="flex items-center gap-2">
                                        <svg
                                          className="h-4 w-4 text-gray-400"
                                          fill="none"
                                          viewBox="0 0 24 24"
                                          stroke="currentColor"
                                          strokeWidth={1.5}
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                          />
                                        </svg>
                                        Checklist
                                      </span>
                                      <span className="text-xs text-gray-400 dark:text-gray-500">
                                        {checklistItems[segment.id]?.filter(
                                          (item) => item.completed
                                        ).length || 0}{" "}
                                        /{" "}
                                        {checklistItems[segment.id]?.length ||
                                          0}{" "}
                                        complete
                                      </span>
                                    </summary>
                                    <div className="px-4 pb-4 space-y-2">
                                      {checklistItems[segment.id]?.map(
                                        (item) => (
                                          <div
                                            key={item.id}
                                            className="flex items-center gap-2 group"
                                          >
                                            <input
                                              type="checkbox"
                                              checked={item.completed}
                                              onChange={() =>
                                                handleToggleChecklistItem(
                                                  segment.id,
                                                  item.id
                                                )
                                              }
                                              className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:bg-gray-800"
                                            />
                                            <span
                                              className={`flex-1 text-sm ${
                                                item.completed
                                                  ? "line-through text-gray-400 dark:text-gray-500"
                                                  : "text-gray-700 dark:text-gray-300"
                                              }`}
                                            >
                                              {item.text}
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                handleDeleteChecklistItem(
                                                  segment.id,
                                                  item.id
                                                )
                                              }
                                              className="opacity-0 group-hover:opacity-100 p-1 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                                            >
                                              <svg
                                                className="h-3 w-3"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                                strokeWidth={2}
                                              >
                                                <path
                                                  strokeLinecap="round"
                                                  strokeLinejoin="round"
                                                  d="M6 18L18 6M6 6l12 12"
                                                />
                                              </svg>
                                            </button>
                                          </div>
                                        )
                                      )}
                                      {addingChecklistItem[segment.id] ? (
                                        <div className="flex items-center gap-2">
                                          <input
                                            type="text"
                                            value={
                                              newChecklistText[segment.id] || ""
                                            }
                                            onChange={(e) => {
                                              const value = e.target.value;
                                              if (value.length <= 50) {
                                                setNewChecklistText((prev) => ({
                                                  ...prev,
                                                  [segment.id]: value,
                                                }));
                                              }
                                            }}
                                            onKeyDown={(e) => {
                                              if (e.key === "Enter") {
                                                handleAddChecklistItem(
                                                  segment.id
                                                );
                                              } else if (e.key === "Escape") {
                                                setAddingChecklistItem(
                                                  (prev) => ({
                                                    ...prev,
                                                    [segment.id]: false,
                                                  })
                                                );
                                                setNewChecklistText((prev) => ({
                                                  ...prev,
                                                  [segment.id]: "",
                                                }));
                                              }
                                            }}
                                            placeholder="Task name (max 50 chars)"
                                            autoFocus
                                            className="flex-1 text-sm rounded-lg border border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 px-3 py-2 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                          />
                                          <span className="text-[10px] text-gray-400">
                                            {
                                              (
                                                newChecklistText[segment.id] ||
                                                ""
                                              ).length
                                            }
                                            /50
                                          </span>
                                        </div>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setAddingChecklistItem((prev) => ({
                                              ...prev,
                                              [segment.id]: true,
                                            }))
                                          }
                                          className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                                        >
                                          + Add task
                                        </button>
                                      )}
                                    </div>
                                  </details>
                                </div>

                                {isFirst && (
                                  <div className="absolute left-[46px] top-3 w-3 h-3 rounded-full bg-blue-500 ring-4 ring-white dark:ring-gray-900" />
                                )}
                                {isLast && (
                                  <div className="absolute left-[46px] bottom-3 w-3 h-3 rounded-full bg-blue-300 dark:bg-blue-500 ring-4 ring-white dark:ring-gray-900" />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* General Checklists (not segment-specific) */}
                  {detail.checklists && detail.checklists.length > 0 && (
                    <div className="border-t border-gray-200 dark:border-gray-800 px-6 py-4">
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                        <svg
                          className="h-4 w-4 text-gray-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={1.5}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
                          />
                        </svg>
                        Trip Checklists
                      </h4>
                      <div className="space-y-3">
                        {detail.checklists.map((checklist) => (
                          <div
                            key={checklist.id}
                            className="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950/40"
                          >
                            <div className="px-4 py-3 flex items-center justify-between">
                              <p className="text-sm font-medium text-gray-900 dark:text-white">
                                {checklist.title}
                              </p>
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {checklist.tasks?.length ?? 0} task
                                {(checklist.tasks?.length ?? 0) === 1
                                  ? ""
                                  : "s"}
                              </span>
                            </div>
                            {checklist.tasks && checklist.tasks.length > 0 && (
                              <div className="border-t border-gray-200 dark:border-gray-800 px-4 py-2 space-y-1">
                                {checklist.tasks.map((task) => (
                                  <div
                                    key={task.id}
                                    className="flex items-center gap-3 py-1"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={task.status === "completed"}
                                      readOnly
                                      className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span
                                      className={`text-sm ${
                                        task.status === "completed"
                                          ? "text-gray-400 line-through"
                                          : "text-gray-700 dark:text-gray-300"
                                      }`}
                                    >
                                      {task.title}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t border-gray-100 dark:border-gray-800">
                  <div className="px-8 lg:px-10 py-6 space-y-6">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Comments
                        {comments.length > 0 && (
                          <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                            ({comments.length})
                          </span>
                        )}
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Share updates, attach context, and keep everyone on the
                        same page.
                      </p>
                    </div>

                    <form
                      onSubmit={handleCommentSubmit}
                      className="flex gap-3 rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-950/30 px-5 py-4"
                    >
                      <div className="h-10 w-10 shrink-0 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-200 flex items-center justify-center text-xs font-semibold">
                        {avatarInitials(
                          detail?.owner?.preferred_name || detail?.owner?.name,
                          detail?.owner?.username
                        )}
                      </div>
                      <div className="flex-1">
                        <textarea
                          value={commentInput}
                          onChange={(event) =>
                            setCommentInput(event.target.value)
                          }
                          className="w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                          rows={1}
                          placeholder="Add a comment..."
                          onFocus={(event) => {
                            event.target.rows = 3;
                          }}
                          onBlur={(event) => {
                            if (!event.target.value.trim())
                              event.target.rows = 1;
                          }}
                        />
                        {commentInput.trim() && (
                          <div className="mt-3 flex justify-end">
                            <button
                              type="submit"
                              className="rounded-full bg-blue-600 text-white px-4 py-1.5 text-sm font-medium shadow-sm hover:bg-blue-700 transition disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={commentSubmitting}
                            >
                              {commentSubmitting ? "Posting..." : "Post"}
                            </button>
                          </div>
                        )}
                      </div>
                    </form>

                    <div className="space-y-6 pt-2">
                      {!comments.length && (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                          <div className="h-16 w-16 rounded-full bg-gray-50 dark:bg-gray-800/50 flex items-center justify-center mb-4 transition-transform hover:scale-110 duration-500">
                            <svg
                              className="h-8 w-8 text-gray-300 dark:text-gray-600"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={1.5}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
                              />
                            </svg>
                          </div>
                          <p className="text-sm font-bold text-gray-400 dark:text-gray-500">
                            No comments yet
                          </p>
                        </div>
                      )}

                      {comments.map((comment) => {
                        const isOwner = comment.author_id === detail?.owner_id;
                        const canModify = comment.author_id === userId;
                        const isEditing = editingCommentId === comment.id;
                        return (
                          <div
                            key={comment.id}
                            className="group relative flex gap-4"
                          >
                            <div className="h-11 w-11 shrink-0 rounded-full bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/10 dark:to-indigo-900/10 border border-blue-100 dark:border-blue-900/30 flex items-center justify-center text-sm font-black text-blue-600 dark:text-blue-400 shadow-sm transition-transform group-hover:scale-110">
                              {avatarInitials(
                                comment.author?.preferred_name ||
                                  comment.author?.name,
                                comment.author?.username
                              )}
                            </div>
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-black text-gray-900 dark:text-white">
                                    {comment.author?.preferred_name ||
                                      comment.author?.name ||
                                      comment.author?.username ||
                                      "Traveler"}
                                  </span>
                                  {isOwner && (
                                    <span className="inline-flex items-center rounded-full bg-blue-500 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-white">
                                      Owner
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                                    {comment.created_at
                                      ? new Date(
                                          comment.created_at
                                        ).toLocaleDateString()
                                      : "Just now"}
                                  </span>
                                  {canModify && !isEditing && (
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingCommentId(comment.id);
                                          setEditCommentText(comment.body);
                                        }}
                                        className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition"
                                        title="Edit comment"
                                      >
                                        <svg
                                          className="h-3.5 w-3.5"
                                          fill="none"
                                          viewBox="0 0 24 24"
                                          stroke="currentColor"
                                          strokeWidth={2}
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
                                          />
                                        </svg>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleDeleteComment(comment.id)
                                        }
                                        className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                                        title="Delete comment"
                                      >
                                        <svg
                                          className="h-3.5 w-3.5"
                                          fill="none"
                                          viewBox="0 0 24 24"
                                          stroke="currentColor"
                                          strokeWidth={2}
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                                          />
                                        </svg>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="relative p-4 bg-gray-50 dark:bg-gray-800/40 rounded-2xl rounded-tl-none border border-gray-100 dark:border-gray-800/50 transition-colors group-hover:bg-white dark:group-hover:bg-gray-800/60 group-hover:shadow-xl group-hover:shadow-gray-200/50 dark:group-hover:shadow-none">
                                {isEditing ? (
                                  <div className="space-y-2">
                                    <textarea
                                      value={editCommentText}
                                      onChange={(e) =>
                                        setEditCommentText(e.target.value)
                                      }
                                      className="w-full rounded-lg border border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                                      rows={3}
                                      autoFocus
                                    />
                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleEditComment(comment.id)
                                        }
                                        className="px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                                      >
                                        Save
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingCommentId(null);
                                          setEditCommentText("");
                                        }}
                                        className="px-3 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 leading-relaxed">
                                    {comment.body}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
