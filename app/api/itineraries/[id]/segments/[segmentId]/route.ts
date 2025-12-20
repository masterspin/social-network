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

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id: itineraryId, segmentId } = await context.params;
    const body = await request.json();
    const userId = body?.user_id as string | undefined;

    const parseOptionalNumber = (value: unknown): number | null | undefined => {
      if (value === undefined) return undefined;
      if (value === null) return null;
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === "string") {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : null;
      }
      return undefined;
    };

    if (!itineraryId || !segmentId || !userId) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      );
    }

    const supabase = getAdminClient();
    const membership = await checkMembership(supabase, itineraryId, userId);

    if (!membership.isOwner) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const updatePayload: Database["public"]["Tables"]["itinerary_segments"]["Update"] =
      {
        type: typeof body.type === "string" ? body.type : undefined,
        title: typeof body.title === "string" ? body.title : undefined,
        description:
          typeof body.description === "string" ? body.description : undefined,
        location_name:
          typeof body.location_name === "string"
            ? body.location_name
            : undefined,
        location_address:
          typeof body.location_address === "string"
            ? body.location_address
            : undefined,
        location_lat: parseOptionalNumber(body.location_lat),
        location_lng: parseOptionalNumber(body.location_lng),
        start_time: body.start_time ?? undefined,
        end_time: body.end_time ?? undefined,
        is_all_day:
          typeof body.is_all_day === "boolean" ? body.is_all_day : undefined,
        provider_name:
          typeof body.provider_name === "string"
            ? body.provider_name
            : undefined,
        confirmation_code:
          typeof body.confirmation_code === "string"
            ? body.confirmation_code
            : undefined,
        transport_number:
          typeof body.transport_number === "string"
            ? body.transport_number
            : undefined,
        seat_info:
          typeof body.seat_info === "string" ? body.seat_info : undefined,
        metadata:
          body.metadata !== null && typeof body.metadata === "object"
            ? body.metadata
            : undefined,
        cost_amount: parseOptionalNumber(body.cost_amount),
        cost_currency:
          typeof body.cost_currency === "string"
            ? body.cost_currency
            : undefined,
      };

    const { error } = await supabase
      .from("itinerary_segments")
      .update(updatePayload)
      .eq("id", segmentId)
      .eq("itinerary_id", itineraryId);

    if (error) throw error;

    return NextResponse.json({ message: "Segment updated" }, { status: 200 });
  } catch (error) {
    console.error("[Itinerary Segment PATCH]", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { id: itineraryId, segmentId } = await context.params;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("user_id");

    if (!itineraryId || !segmentId || !userId) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      );
    }

    const supabase = getAdminClient();
    const membership = await checkMembership(supabase, itineraryId, userId);

    if (!membership.isOwner) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { error } = await supabase
      .from("itinerary_segments")
      .delete()
      .eq("id", segmentId)
      .eq("itinerary_id", itineraryId);

    if (error) throw error;

    return NextResponse.json({ message: "Segment deleted" }, { status: 200 });
  } catch (error) {
    console.error("[Itinerary Segment DELETE]", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
