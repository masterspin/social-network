import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/supabase";
import { chatWithTools } from "@/lib/ai/openrouter";
import {
  fetchFlightSuggestionFree,
  fetchPlaceSuggestion,
  fetchRideSuggestion,
} from "@/lib/autofill/providers";
import { fetchFlightOffersAmadeus } from "@/lib/autofill/amadeus";
import { SegmentAutofillPlan } from "@/lib/autofill/types";

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
      id?: string;
      type: string;
      title: string;
      start_time?: string;
      location_name?: string;
    }>;
  };
};

type ChatResponse = {
  message: string;
  plans?: SegmentAutofillPlan[];
  error?: string;
};

const SYSTEM_PROMPT = `You are a helpful travel assistant that helps users plan their itineraries. You can search for flights, hotels, and rides, as well as remove existing segments.

**BE CONVERSATIONAL - ASK CLARIFYING QUESTIONS:**
CRITICAL: Before immediately searching, ask the user about their preferences to clarify their needs and find better options:

For FLIGHTS, ask about:
- Preferred time of day (morning, afternoon, evening arrival/departure)
- Direct flights only, or open to connections?
- Budget range or price sensitivity
- Cabin class (economy, business, first)
- Flexible dates (±1-2 days for better prices)

For HOTELS, ask about:
- Budget per night
- Star rating preference (3-star, 4-star, luxury)
- Neighborhood/area preferences
- Check-in/check-out dates
- Amenities needed (pool, gym, breakfast)

For TRANSPORTATION, ask about:
- Preferred mode (taxi, rideshare, public transit, rental car)
- Budget and luggage amount

**SMART QUESTIONING:**
- If user provides minimal info (e.g., "Find flights to Paris"), ask 2-3 key questions
- Prioritize the most impactful preferences (dates, budget, time of day)
- Don't overwhelm - keep it conversational
- If user seems in a hurry, offer to search with defaults
- Remember previous answers in the conversation

**SPECIAL CASE - REPLACEMENT REQUESTS:**
When a user says "replace my flight" or "find a replacement":
1. FIRST ask about their preferences (time, budget, direct vs connections, airlines to avoid)
2. THEN search for alternatives
3. THEN delete the old flight when they select a new one

Example:
User: "I'd like to replace my flight to Zurich and not be Air Canada"
AI: "I can help you find a non-Air Canada replacement! A few questions:
- What's your preferred departure time?
- Direct flights only or open to connections?
- Any budget in mind?
Once I know your preferences, I'll search for the best alternatives!"

**CRITICAL: USING THE maxConnections PARAMETER**

When users mention connection preferences, YOU MUST use the maxConnections parameter:

User says → Use maxConnections value:
- "direct only" / "non-stop" / "direct flights" → maxConnections: 0
- "1 connection" / "1 stop" / "max 1 stop" → maxConnections: 1  
- "2 connections" / "2 stops" / "max 2 stops" → maxConnections: 2
- "no preference" / doesn't mention → omit maxConnections (show all)

Examples:
❌ WRONG:
User: "Find flights with 1 connection"
AI calls: search_flights(origin: "DTW", destination: "ZRH", date: "2026-02-27")

✅ CORRECT:
User: "Find flights with 1 connection"
AI calls: search_flights(origin: "DTW", destination: "ZRH", date: "2026-02-27", maxConnections: 1)

When users ask about travel, use the available tools to:
- Search for flights: Use search_flights with origin, destination, and optional date
- Search for hotels: Use search_hotels with location/city name and optional check-in date
- Search for rides/transport: Use search_rides for Uber, taxi, or car service requests between two places
- Remove segments: Use delete_segment with the segment ID to remove an existing itinerary item

Be conversational and helpful. When suggesting segments, explain what you found.

**CRITICAL: Never fabricate or make up data**
- ONLY present options that are returned by the search tools
- If a search returns no results, tell the user honestly: "I couldn't find any flights/hotels for that route/location"
- Do NOT invent flight numbers, airlines, times, or prices
- Do NOT create placeholder or example data
- If the tools return empty results, explain this to the user and suggest alternatives (different dates, nearby airports, etc.)

Important guidelines:
- For flights, extract city/airport codes (e.g., NYC, LAX, LHR) from natural language
- For hotels, extract city or specific hotel names
- For rides, extract specific origin and destination names (e.g., "Airport" to "Hotel", "SFO" to "Downtown")
- If dates are mentioned, parse them into YYYY-MM-DD format
- Always confirm what you're searching for or deleting before calling tools

**Multi-leg Journey Detection for Deletions:**
When a user asks to delete a flight from City A to City C, but the itinerary only has connecting flights (A→B and B→C), you should:
1. Identify that these segments form a complete journey from A to C
2. Look for sequential flights on the same or consecutive days where:
   - The destination of one flight matches the origin of the next flight
   - The flights are reasonably close in time (within 24 hours)
3. Delete ALL segments that form this journey together
4. Explain to the user: "I found your journey from A to C with a connection in B. I'll remove both flight segments."

Example:
- User says: "Remove my flight from Detroit to Zurich"
- Segments show: "DTW → Toronto" and "Toronto → Zurich" on the same day
- Action: Delete BOTH segments (they form one journey)
- Response: "I found your journey from Detroit to Zurich with a connection in Toronto. I'll remove both flight segments for you."

Similarly, if a user asks to delete "my flight to Paris" and there are multiple connecting segments ending in Paris, delete all of them as one journey.

**Replacement Requests:**
When a user asks to "replace" or "find a replacement for" an existing segment:
1. First, identify which segment(s) they want to replace (use the same multi-leg detection as above)
2. Search for new options using the appropriate search tool
3. Create a SINGLE plan that includes BOTH:
   - Delete actions for the old segment(s)
   - Create actions for the new segment(s)
4. This ensures the old flight is removed when the new one is added

Example:
- User says: "Replace my DTW to Zurich flight with a non-Air Canada option"
- Segments show: "DTW → Toronto → Zurich" (Air Canada)
- Actions:
  1. Call search_flights for DTW to Zurich alternatives
  2. Call delete_segment for both old flight segments
  3. Return ONE plan with: delete actions for old flights + create actions for new flights
- Response: "I found some alternatives. This plan will remove your current Air Canada connection and add [new option]."

**Important:** For replacements, you MUST call both the search tool AND the delete_segment tool, then combine the results into a single plan.`;

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "search_flights",
      description:
        "Search for flight options between two locations. Returns available flights with times and details. Can filter by maximum number of connections/stops.",
      parameters: {
        type: "object",
        properties: {
          origin: {
            type: "string",
            description: "Origin airport code (e.g., 'JFK', 'LAX')",
          },
          destination: {
            type: "string",
            description: "Destination airport code (e.g., 'LHR', 'CDG')",
          },
          date: {
            type: "string",
            description:
              "Departure date in YYYY-MM-DD format (optional, defaults to today)",
          },
          maxConnections: {
            type: "number",
            description:
              "Maximum number of connections/stops (optional). 0 = direct flights only, 1 = max 1 stop, 2 = max 2 stops, etc. Omit to show all options.",
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
  {
    type: "function" as const,
    function: {
      name: "search_rides",
      description: "Search for ride/transport options (Uber/Taxi) between two locations.",
      parameters: {
        type: "object",
        properties: {
          origin: {
            type: "string",
            description: "Pickup location name or address",
          },
          destination: {
            type: "string",
            description: "Dropoff location name or address",
          },
          time: {
            type: "string",
            description: "Pickup time in ISO format (optional)",
          },
        },
        required: ["origin", "destination"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "delete_segment",
      description: "Delete one or more existing segments from the itinerary. Use this when the user asks to remove or delete a flight, hotel, or other segment. For multi-leg journeys, you can delete multiple segments at once by providing an array of segment IDs.",
      parameters: {
        type: "object",
        properties: {
          segment_ids: {
            type: "array",
            items: { type: "string" },
            description: "Array of segment IDs to delete. For a single segment, provide an array with one ID. For multi-leg journeys, provide all segment IDs that form the complete journey.",
          },
        },
        required: ["segment_ids"],
      },
    },
  },
];

async function executeToolCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<SegmentAutofillPlan[]> {
  console.log(`[Chat] Executing tool: ${toolName}`, args);

  try {
    switch (toolName) {
      case "search_flights": {
        const { origin, destination, date, maxConnections } = args;
        if (typeof origin === "string" && typeof destination === "string") {
          const results = await fetchFlightOffersAmadeus(
            origin,
            destination,
            typeof date === "string" ? date : undefined,
            typeof maxConnections === "number" ? maxConnections : undefined
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

      case "search_rides": {
        const { origin, destination, time } = args;
        if (typeof origin === "string" && typeof destination === "string") {
          const result = await fetchRideSuggestion({
            origin,
            destination,
            time: typeof time === "string" ? time : undefined,
          });
          return result ? [result] : [];
        }
        return [];
      }

      case "delete_segment": {
        const { segment_ids } = args;
        if (Array.isArray(segment_ids) && segment_ids.length > 0) {
          // Validate all IDs are strings
          const validIds = segment_ids.filter(id => typeof id === "string");
          if (validIds.length === 0) return [];

          // Try to get segment titles from context for better description
          // Note: We don't have direct access to context here, so we'll use a generic message
          // The frontend confirmation will show the actual titles

          const title = validIds.length === 1
            ? "Remove Segment"
            : `Remove ${validIds.length} Segments`;

          const description = validIds.length === 1
            ? "Delete the selected segment from your itinerary"
            : `Delete ${validIds.length} segments that form a complete journey`;

          // Return a plan with multiple delete actions
          return [{
            title,
            description,
            actions: validIds.map(id => ({ type: "delete" as const, segmentId: id })),
          }];
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
          (seg, i) => {
            // Extract origin/destination from flight titles for better journey detection
            let segmentInfo = `${seg.type}: ${seg.title}`;

            // For flights, try to extract route info
            if (seg.type === 'flight' && seg.title) {
              const routeMatch = seg.title.match(/([A-Z]{3})\s*(?:→|->)\s*([A-Z]{3})/);
              if (routeMatch) {
                segmentInfo = `flight: ${routeMatch[1]} → ${routeMatch[2]}`;
              }
            }

            return `${i + 1}. [ID: ${seg.id || 'unknown'}] ${segmentInfo}${seg.start_time
              ? ` on ${new Date(seg.start_time).toLocaleDateString()}`
              : ""
              }`;
          }
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
    let allPlans: SegmentAutofillPlan[] = [];
    if (result.toolCalls && result.toolCalls.length > 0) {
      console.log(`[Chat] 🤖 AI requested ${result.toolCalls.length} tool call(s)`);

      for (const toolCall of result.toolCalls) {
        console.log(`[Chat] 🔧 Tool: ${toolCall.name}`, JSON.stringify(toolCall.arguments, null, 2));

        const plans = await executeToolCall(
          toolCall.name,
          toolCall.arguments
        );

        console.log(`[Chat] ✅ Returned ${plans.length} plan(s)`);
        if (plans.length > 0 && plans[0].actions[0]?.type === 'create') {
          const firstSegment = plans[0].actions[0].segment;
          console.log(`[Chat] 📊 Source: ${firstSegment.source || 'unknown'}`);
        }

        allPlans = [...allPlans, ...plans];
      }
    } else {
      console.log(`[Chat] 💬 AI responded without using tools`);
    }

    return NextResponse.json({
      message: result.message,
      plans: allPlans.length > 0 ? allPlans : undefined,
    });
  } catch (error) {
    console.error("[Chat] Error:", error);
    return NextResponse.json(
      {
        message: "",
        error:
          error instanceof Error ? error.message : "Failed to process request",
      },
      { status: 500 }
    );
  }
}
