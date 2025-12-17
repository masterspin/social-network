import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/supabase";

type TypedSupabaseClient = SupabaseClient<Database>;

type Membership = {
  isOwner: boolean;
  isMember: boolean;
};

type RouteContext = {
  params: Promise<{ id: string }>;
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
        console.warn(
          "[Itinerary Segments] Failed to resolve user from token",
          reason
        );
      }
    }
  }

  return null;
}

async function checkMembership(
  supabase: TypedSupabaseClient,
  itineraryId: string,
  userId: string
): Promise<Membership> {
  const { data: itinerary } = await supabase
    .from("itineraries")
    .select("owner_id")
    .eq("id", itineraryId)
    .single();

  if (!itinerary) {
    return { isOwner: false, isMember: false };
  }

  if (itinerary.owner_id === userId) {
    return { isOwner: true, isMember: true };
  }

  const { data: membership } = await supabase
    .from("itinerary_travelers")
    .select("id, role, invitation_status")
    .eq("itinerary_id", itineraryId)
    .eq("user_id", userId)
    .in("invitation_status", ["accepted", "pending"])
    .maybeSingle();

  const isCoOwner =
    membership?.role === "owner" &&
    membership?.invitation_status === "accepted";
  const isMember = Boolean(membership);

  return { isOwner: isCoOwner, isMember };
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id: itineraryId } = await context.params;
    const userId = await resolveUserId(request);

    if (!itineraryId || !userId) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      );
    }

    const supabase = getAdminClient();
    const membership = await checkMembership(supabase, itineraryId, userId);

    if (!membership.isMember) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("itinerary_segments")
      .select(
        `
        *,
        created_by_user:users!itinerary_segments_created_by_fkey(id, username, name, preferred_name, profile_image_url)
      `
      )
      .eq("itinerary_id", itineraryId)
      .order("start_time", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error("[Itinerary Segments GET]", error);
    const isConfigError =
      (error as Error).message === "Missing Supabase configuration";
    return NextResponse.json(
      { error: (error as Error).message },
      { status: isConfigError ? 500 : 500 }
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id: itineraryId } = await context.params;
    const body = await request.json();
    const creatorId = body?.user_id as string | undefined;

    if (!itineraryId || !creatorId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const supabase = getAdminClient();
    const membership = await checkMembership(supabase, itineraryId, creatorId);

    if (!membership.isOwner) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const latValue =
      typeof body.location_lat === "number"
        ? body.location_lat
        : typeof body.location_lat === "string"
        ? Number.parseFloat(body.location_lat)
        : null;
    const lngValue =
      typeof body.location_lng === "number"
        ? body.location_lng
        : typeof body.location_lng === "string"
        ? Number.parseFloat(body.location_lng)
        : null;

    const costAmount =
      typeof body.cost_amount === "number"
        ? body.cost_amount
        : typeof body.cost_amount === "string"
        ? Number.parseFloat(body.cost_amount)
        : null;

    const segmentPayload: Database["public"]["Tables"]["itinerary_segments"]["Insert"] =
      {
        itinerary_id: itineraryId,
        type: typeof body.type === "string" ? body.type : "custom",
        title: typeof body.title === "string" ? body.title : "Untitled Segment",
        description:
          typeof body.description === "string" ? body.description : null,
        location_name:
          typeof body.location_name === "string" ? body.location_name : null,
        location_address:
          typeof body.location_address === "string"
            ? body.location_address
            : null,
        location_lat: Number.isFinite(latValue) ? latValue : null,
        location_lng: Number.isFinite(lngValue) ? lngValue : null,
        start_time: body.start_time ?? null,
        end_time: body.end_time ?? null,
        is_all_day:
          typeof body.is_all_day === "boolean" ? body.is_all_day : null,
        provider_name:
          typeof body.provider_name === "string" ? body.provider_name : null,
        confirmation_code:
          typeof body.confirmation_code === "string"
            ? body.confirmation_code
            : null,
        transport_number:
          typeof body.transport_number === "string"
            ? body.transport_number
            : null,
        seat_info: typeof body.seat_info === "string" ? body.seat_info : null,
        metadata:
          body.metadata !== null && typeof body.metadata === "object"
            ? body.metadata
            : null,
        reminder_offset_minutes:
          typeof body.reminder_offset_minutes === "number"
            ? body.reminder_offset_minutes
            : null,
        cost_amount: Number.isFinite(costAmount) ? costAmount : null,
        cost_currency:
          typeof body.cost_currency === "string" ? body.cost_currency : null,
        created_by: creatorId,
      };

    const { data, error } = await supabase
      .from("itinerary_segments")
      .insert(segmentPayload)
      .select(
        `
        *,
        created_by_user:users!itinerary_segments_created_by_fkey(id, username, name, preferred_name, profile_image_url)
      `
      )
      .single();

    if (error) throw error;

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error("[Itinerary Segments POST]", error);
    const isConfigError =
      (error as Error).message === "Missing Supabase configuration";
    return NextResponse.json(
      { error: (error as Error).message },
      { status: isConfigError ? 500 : 500 }
    );
  }
}
