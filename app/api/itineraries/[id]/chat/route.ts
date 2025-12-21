import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/supabase";
import { chatWithTools } from "@/lib/ai/openrouter";
import {
  fetchFlightSuggestionFree,
  fetchPlaceSuggestion,
} from "@/lib/autofill/providers";
import { SegmentAutofillSuggestion } from "@/lib/autofill/types";

type TypedSupabaseClient = SupabaseClient<Database>;

function getAdminClient(): TypedSupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE;

  if (!url || !serviceKey) {
    throw new Error("Missing Supabase configuration");
  }

  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false },
  });
}

async function resolveUserId(request: Request): Promise<string | null> {
  const { searchParams } = new URL(request.url);
  const candidates = [
    searchParams.get("user_id"),
    request.headers.get("x-user-id"),
    request.headers.get("X-User-Id"),
    request.headers.get("X-USER-ID"),
  ].filter((value): value is string =>
    Boolean(value && value !== "undefined" && value !== "null")
  );

  if (candidates.length > 0) {
    return candidates[0];
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (url && anonKey) {
      const tempClient = createClient<Database>(url, anonKey, {
        auth: { persistSession: false },
      });
      const {
        data: { user },
      } = await tempClient.auth.getUser(token);
      if (user) {
        return user.id;
      }
    }
  }

  return null;
}

type ChatRequest = {
  user_id?: string;
  message: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  itinerary_id: string;
  context?: {
    existing_segments?: Array<{
      type: string;
      title: string;
      start_time?: string;
      location_name?: string;
    }>;
  };
};

type ChatResponse = {
  message: string;
  suggestions?: SegmentAutofillSuggestion[];
  error?: string;
};

const SYSTEM_PROMPT = `You are a helpful travel assistant that helps users plan their itineraries. You can search for flights and hotels.

When users ask about travel, use the available tools to search for:
- Flights: Use search_flights with origin, destination, and optional date
- Hotels: Use search_hotels with location/city name and optional check-in date

Be conversational and helpful. When suggesting segments, explain what you found.

Important guidelines:
- For flights, extract city/airport codes (e.g., NYC, LAX, LHR) from natural language
- For hotels, extract city or specific hotel names
- If dates are mentioned, parse them into YYYY-MM-DD format
- Always confirm what you're searching for before calling tools`;

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "search_flights",
      description:
        "Search for flight options between two locations. Returns available flights with times and details.",
      parameters: {
        type: "object",
        properties: {
          origin: {
            type: "string",
            description: "Origin airport code or city (e.g., NYC, LAX, JFK)",
          },
          destination: {
            type: "string",
            description:
              "Destination airport code or city (e.g., LON, LHR, Paris)",
          },
          date: {
            type: "string",
            description: "Departure date in YYYY-MM-DD format (optional)",
          },
        },
        required: ["origin", "destination"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_hotels",
      description:
        "Search for hotel options in a specific location. Returns hotels with addresses and details.",
      parameters: {
        type: "object",
        properties: {
          location: {
            type: "string",
            description: "City name or specific hotel name to search for",
          },
          check_in_date: {
            type: "string",
            description: "Check-in date in YYYY-MM-DD format (optional)",
          },
          latitude: {
            type: "number",
            description: "Latitude for location-based search (optional)",
          },
          longitude: {
            type: "number",
            description: "Longitude for location-based search (optional)",
          },
        },
        required: ["location"],
      },
    },
  },
];

async function executeToolCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<SegmentAutofillSuggestion[]> {
  console.log(`[Chat] Executing tool: ${toolName}`, args);

  try {
    switch (toolName) {
      case "search_flights": {
        const { origin, destination, date } = args;
        if (typeof origin === "string" && typeof destination === "string") {
          const results = await fetchFlightSuggestionFree(
            origin,
            destination,
            typeof date === "string" ? date : undefined
          );
          return results;
        }
        return [];
      }

      case "search_hotels": {
        const { location, latitude, longitude } = args;
        if (typeof location === "string") {
          const result = await fetchPlaceSuggestion({
            query: location,
            type: "hotel",
            context:
              typeof latitude === "number" && typeof longitude === "number"
                ? { lat: latitude, lng: longitude, radiusMeters: 20000 }
                : undefined,
          });
          return result ? [result] : [];
        }
        return [];
      }

      default:
        console.warn(`[Chat] Unknown tool: ${toolName}`);
        return [];
    }
  } catch (error) {
    console.error(`[Chat] Tool execution error:`, error);
    return [];
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ChatResponse>> {
  try {
    const { id: itineraryId } = await params;
    const body: ChatRequest = await request.json();
    const { message, history = [], context, user_id } = body;

    // Verify user authentication - check body first, then headers/token
    let userId = user_id || (await resolveUserId(request));
    if (!userId) {
      return NextResponse.json(
        { message: "", error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Check itinerary ownership/access
    const supabase = getAdminClient();
    const { data: itinerary } = await supabase
      .from("itineraries")
      .select("id, owner_id")
      .eq("id", itineraryId)
      .single();

    if (!itinerary || itinerary.owner_id !== userId) {
      return NextResponse.json(
        { message: "", error: "Itinerary not found or access denied" },
        { status: 404 }
      );
    }

    // Build context message
    let contextMessage = "";
    if (context?.existing_segments && context.existing_segments.length > 0) {
      contextMessage = `\n\nCurrent itinerary segments:\n${context.existing_segments
        .map(
          (seg, i) =>
            `${i + 1}. ${seg.type}: ${seg.title}${
              seg.start_time
                ? ` on ${new Date(seg.start_time).toLocaleDateString()}`
                : ""
            }`
        )
        .join("\n")}`;
    }

    // Prepare messages for AI
    const messages = [
      { role: "system" as const, content: SYSTEM_PROMPT + contextMessage },
      ...history,
      { role: "user" as const, content: message },
    ];

    // Call AI with tools
    const result = await chatWithTools(messages, TOOLS);

    // Execute any tool calls
    let allSuggestions: SegmentAutofillSuggestion[] = [];
    if (result.toolCalls && result.toolCalls.length > 0) {
      for (const toolCall of result.toolCalls) {
        const suggestions = await executeToolCall(
          toolCall.name,
          toolCall.arguments
        );
        allSuggestions = [...allSuggestions, ...suggestions];
      }
    }

    return NextResponse.json({
      message: result.message,
      suggestions: allSuggestions.length > 0 ? allSuggestions : undefined,
    });
  } catch (error) {
    console.error("[Chat API] Error:", error);
    return NextResponse.json(
      {
        message: "",
        error:
          error instanceof Error ? error.message : "Failed to process chat",
      },
      { status: 500 }
    );
  }
}
