import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/supabase";

type TypedSupabaseClient = SupabaseClient<Database>;

type RouteContext = {
  params: Promise<{ id: string; segmentId: string; itemId: string }>;
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

// PATCH - Toggle checklist item status
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id: itineraryId, segmentId, itemId } = await context.params;
    const body = await request.json();
    const userId = body?.user_id as string | undefined;

    if (!itineraryId || !segmentId || !itemId || !userId) {
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

    // Verify item exists and belongs to the segment
    const { data: existingItem } = await supabase
      .from("itinerary_tasks")
      .select("id, status, segment_id, itinerary_id")
      .eq("id", itemId)
      .single();

    if (!existingItem) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    if (existingItem.segment_id !== segmentId) {
      return NextResponse.json(
        { error: "Item does not belong to this segment" },
        { status: 400 }
      );
    }

    if (existingItem.itinerary_id !== itineraryId) {
      return NextResponse.json(
        { error: "Item does not belong to this itinerary" },
        { status: 400 }
      );
    }

    // Toggle status: 'open' <-> 'done'
    const newStatus = existingItem.status === "done" ? "open" : "done";
    const completedAt = newStatus === "done" ? new Date().toISOString() : null;

    const { data, error } = await supabase
      .from("itinerary_tasks")
      .update({
        status: newStatus,
        completed_at: completedAt,
      })
      .eq("id", itemId)
      .select("id, title, status, created_at")
      .single();

    if (error) throw error;

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error("[Checklist Item PATCH]", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

// DELETE - Remove a checklist item
export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { id: itineraryId, segmentId, itemId } = await context.params;
    const body = await request.json();
    const userId = body?.user_id as string | undefined;

    if (!itineraryId || !segmentId || !itemId || !userId) {
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

    // Verify item exists and belongs to the segment
    const { data: existingItem } = await supabase
      .from("itinerary_tasks")
      .select("id, segment_id, itinerary_id")
      .eq("id", itemId)
      .single();

    if (!existingItem) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    if (existingItem.segment_id !== segmentId) {
      return NextResponse.json(
        { error: "Item does not belong to this segment" },
        { status: 400 }
      );
    }

    if (existingItem.itinerary_id !== itineraryId) {
      return NextResponse.json(
        { error: "Item does not belong to this itinerary" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("itinerary_tasks")
      .delete()
      .eq("id", itemId);

    if (error) throw error;

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("[Checklist Item DELETE]", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
