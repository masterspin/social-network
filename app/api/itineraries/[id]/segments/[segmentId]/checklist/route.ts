import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/supabase";

type TypedSupabaseClient = SupabaseClient<Database>;

type RouteContext = {
  params: Promise<{ id: string; segmentId: string }>;
};

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
  const options = [
    searchParams.get("user_id"),
    request.headers.get("x-user-id"),
    request.headers.get("X-User-Id"),
    request.headers.get("X-USER-ID"),
  ].filter((value): value is string =>
    Boolean(value && value !== "undefined" && value !== "null")
  );

  if (options.length > 0) {
    return options[0];
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      process.env.SUPABASE_ANON_KEY ??
      null;

    if (url && anonKey && token) {
      try {
        const authClient = createClient<Database>(url, anonKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data, error } = await authClient.auth.getUser(token);
        if (!error && data?.user?.id) {
          return data.user.id;
        }
      } catch (reason) {
        console.warn("[Segment Checklist] Failed to resolve user", reason);
      }
    }
  }

  return null;
}

async function checkAccess(
  supabase: TypedSupabaseClient,
  itineraryId: string,
  userId: string
): Promise<boolean> {
  const { data: itinerary } = await supabase
    .from("itineraries")
    .select("owner_id")
    .eq("id", itineraryId)
    .single();

  if (!itinerary) return false;
  if (itinerary.owner_id === userId) return true;

  const { data: membership } = await supabase
    .from("itinerary_travelers")
    .select("invitation_status")
    .eq("itinerary_id", itineraryId)
    .eq("user_id", userId)
    .eq("invitation_status", "accepted")
    .maybeSingle();

  return Boolean(membership);
}

// GET all checklist items for a segment
export async function GET(request: Request, context: RouteContext) {
  try {
    const { id: itineraryId, segmentId } = await context.params;
    const userId = await resolveUserId(request);

    if (!itineraryId || !segmentId || !userId) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      );
    }

    const supabase = getAdminClient();
    const hasAccess = await checkAccess(supabase, itineraryId, userId);

    if (!hasAccess) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    // Verify segment belongs to itinerary
    const { data: segment } = await supabase
      .from("itinerary_segments")
      .select("id")
      .eq("id", segmentId)
      .eq("itinerary_id", itineraryId)
      .single();

    if (!segment) {
      return NextResponse.json({ error: "Segment not found" }, { status: 404 });
    }

    // Fetch checklist items
    const { data, error } = await supabase
      .from("itinerary_tasks")
      .select("id, title, status, created_at")
      .eq("segment_id", segmentId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error("[Segment Checklist GET]", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

// POST - Create a new checklist item for a segment
export async function POST(request: Request, context: RouteContext) {
  try {
    const { id: itineraryId, segmentId } = await context.params;
    const body = await request.json();
    const userId = body?.user_id as string | undefined;

    if (!itineraryId || !segmentId || !userId) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      );
    }

    if (typeof body.text !== "string" || body.text.trim().length === 0) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    if (body.text.trim().length > 50) {
      return NextResponse.json(
        { error: "Text must be 50 characters or less" },
        { status: 400 }
      );
    }

    const supabase = getAdminClient();
    const hasAccess = await checkAccess(supabase, itineraryId, userId);

    if (!hasAccess) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    // Verify segment belongs to itinerary
    const { data: segment } = await supabase
      .from("itinerary_segments")
      .select("id")
      .eq("id", segmentId)
      .eq("itinerary_id", itineraryId)
      .single();

    if (!segment) {
      return NextResponse.json({ error: "Segment not found" }, { status: 404 });
    }

    // Create checklist item
    const { data, error } = await supabase
      .from("itinerary_tasks")
      .insert({
        itinerary_id: itineraryId,
        segment_id: segmentId,
        title: body.text.trim(),
        status: "open",
        created_by: userId,
      })
      .select("id, title, status, created_at")
      .single();

    if (error) throw error;

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error("[Segment Checklist POST]", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
