import { NextResponse } from "next/server";
import {
  fetchFlightSuggestion,
  fetchPlaceSuggestion,
  fetchTrainSuggestion,
  ProviderRequestError,
  ProviderUnavailableError,
} from "@/lib/autofill/providers";
import {
  SegmentAutofillRequest,
  SegmentAutofillSuggestion,
  SegmentAutofillType,
} from "@/lib/autofill/types";

export const dynamic = "force-dynamic";

type CacheEntry = {
  expiresAt: number;
  suggestion: SegmentAutofillSuggestion;
};

const CACHE_TTL_SECONDS = Number.parseInt(
  process.env.SEGMENT_AUTOFILL_CACHE_TTL_SECONDS ?? "900",
  10
);
const CACHE_TTL_MS = Number.isFinite(CACHE_TTL_SECONDS)
  ? Math.max(60, CACHE_TTL_SECONDS) * 1000
  : 15 * 60 * 1000;

const memoryCache = new Map<string, CacheEntry>();

function clampNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function sanitizeContext(value: unknown): SegmentAutofillRequest["context"] {
  if (!value || typeof value !== "object") return null;
  const maybe = value as Record<string, unknown>;
  const lat = clampNumber(maybe.lat);
  const lng = clampNumber(maybe.lng);
  const radiusMeters = clampNumber(maybe.radiusMeters);
  if (lat === undefined && lng === undefined && radiusMeters === undefined) {
    return null;
  }
  return {
    lat,
    lng,
    radiusMeters,
  };
}

function normalizeType(input: unknown): SegmentAutofillType | null {
  if (typeof input !== "string") return null;
  const value = input.trim().toLowerCase();
  const map: Record<string, SegmentAutofillType> = {
    flight: "flight",
    flights: "flight",
    train: "train",
    transport: "transport",
    ground: "transport",
    hotel: "hotel",
    lodging: "hotel",
    stay: "hotel",
    meal: "meal",
    dining: "meal",
    restaurant: "meal",
    activity: "activity",
    event: "activity",
    custom: "custom",
  };
  return map[value] ?? null;
}

function normalizeRequest(raw: unknown): SegmentAutofillRequest | null {
  if (!raw || typeof raw !== "object") return null;
  const payload = raw as Record<string, unknown>;
  const type = normalizeType(payload.type);
  const query = typeof payload.query === "string" ? payload.query.trim() : "";
  if (!type || !query) return null;
  return {
    type,
    query,
    date: typeof payload.date === "string" ? payload.date : undefined,
    context: sanitizeContext(payload.context),
    metadata:
      payload.metadata && typeof payload.metadata === "object"
        ? (payload.metadata as Record<string, unknown>)
        : null,
  };
}

function buildCacheKey(payload: SegmentAutofillRequest): string {
  const normalizedQuery = payload.query.trim().toLowerCase();
  const normalizedDate = payload.date?.slice(0, 10) ?? "";
  const contextKey = payload.context
    ? `${payload.context.lat ?? ""}|${payload.context.lng ?? ""}|${
        payload.context.radiusMeters ?? ""
      }`
    : "";
  return `${payload.type}|${normalizedQuery}|${normalizedDate}|${contextKey}`;
}

function getFromCache(key: string): SegmentAutofillSuggestion | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return entry.suggestion;
}

function setCache(key: string, suggestion: SegmentAutofillSuggestion) {
  memoryCache.set(key, {
    suggestion,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

async function resolveSuggestion(
  payload: SegmentAutofillRequest
): Promise<SegmentAutofillSuggestion | null> {
  switch (payload.type) {
    case "flight":
      return fetchFlightSuggestion(payload.query, payload.date);
    case "train":
    case "transport":
      return fetchTrainSuggestion(payload.query, payload.date);
    case "hotel":
    case "meal":
    case "activity":
      return fetchPlaceSuggestion({
        query: payload.query,
        type: payload.type as "hotel" | "meal" | "activity",
        context: payload.context,
      });
    default:
      return null;
  }
}

export async function POST(request: Request) {
  try {
    const raw = await request.json().catch(() => null);
    const payload = normalizeRequest(raw);

    if (!payload) {
      return NextResponse.json(
        { error: "Provide a type and query to use smart fill." },
        { status: 400 }
      );
    }

    if (payload.query.length < 2) {
      return NextResponse.json(
        { error: "Query must be at least 2 characters." },
        { status: 400 }
      );
    }

    const cacheKey = buildCacheKey(payload);
    const cached = getFromCache(cacheKey);
    if (cached) {
      return NextResponse.json({
        data: cached,
        meta: { cache: "hit" },
      });
    }

    const suggestion = await resolveSuggestion(payload);
    if (!suggestion) {
      return NextResponse.json(
        { error: "No matching details found for that request." },
        { status: 404 }
      );
    }

    setCache(cacheKey, suggestion);
    return NextResponse.json({
      data: suggestion,
      meta: { cache: "miss" },
    });
  } catch (error) {
    if (error instanceof ProviderUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    if (error instanceof ProviderRequestError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    console.error("[Segments Autofill]", error);
    return NextResponse.json(
      { error: "We could not complete that smart fill request." },
      { status: 500 }
    );
  }
}
