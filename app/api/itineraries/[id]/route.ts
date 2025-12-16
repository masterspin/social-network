import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/supabase";

type TypedSupabaseClient = SupabaseClient<Database>;

type MembershipCheck = {
  isOwner: boolean;
  isMember: boolean;
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

async function getMembership(
  supabase: TypedSupabaseClient,
  itineraryId: string,
  userId: string
): Promise<MembershipCheck> {
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
    .select("id")
    .eq("itinerary_id", itineraryId)
    .eq("user_id", userId)
    .in("invitation_status", ["accepted", "pending"])
    .maybeSingle();

  return { isOwner: false, isMember: Boolean(membership) };
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const itineraryId = params.id;
    const { searchParams } = new URL(request.url);
    const userId =
      searchParams.get("user_id") ?? request.headers.get("x-user-id");

    if (!itineraryId || !userId) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      );
    }

    const supabase = getAdminClient();
    const membership = await getMembership(supabase, itineraryId, userId);

    if (!membership.isMember) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("itineraries")
      .select(
        `
        *,
        owner:users!itineraries_owner_id_fkey(id, username, name, preferred_name, profile_image_url),
        travelers:itinerary_travelers(user_id, email, role, invitation_status, notifications_enabled, color_hex),
        segments:itinerary_segments(
          *,
          created_by_user:users!itinerary_segments_created_by_fkey(id, username, name, preferred_name, profile_image_url)
        ),
        checklists:itinerary_checklists(
          *,
          tasks:itinerary_tasks(
            *,
            assignee:users!itinerary_tasks_assignee_id_fkey(id, username, name, preferred_name, profile_image_url)
          )
        )
      `
      )
      .eq("id", itineraryId)
      .single();

    if (error) throw error;

    if (data?.segments) {
      data.segments.sort((a: any, b: any) => {
        const left = a.start_time
          ? new Date(a.start_time).getTime()
          : Number.MAX_SAFE_INTEGER;
        const right = b.start_time
          ? new Date(b.start_time).getTime()
          : Number.MAX_SAFE_INTEGER;
        return left - right;
      });
    }

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error("[Itinerary Detail GET]", error);
    const isConfigError =
      (error as Error).message === "Missing Supabase configuration";
    return NextResponse.json(
      { error: (error as Error).message },
      { status: isConfigError ? 500 : 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const itineraryId = params.id;
    const body = await request.json();
    const ownerId = body?.owner_id as string | undefined;

    if (!itineraryId || !ownerId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const supabase = getAdminClient();
    const membership = await getMembership(supabase, itineraryId, ownerId);

    if (!membership.isOwner) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const updatePayload: Database["public"]["Tables"]["itineraries"]["Update"] =
      {
        title: typeof body.title === "string" ? body.title : undefined,
        description:
          typeof body.description === "string" ? body.description : undefined,
        summary: typeof body.summary === "string" ? body.summary : undefined,
        start_date: body.start_date ?? undefined,
        end_date: body.end_date ?? undefined,
        timezone: typeof body.timezone === "string" ? body.timezone : undefined,
        visibility:
          typeof body.visibility === "string" ? body.visibility : undefined,
        status: typeof body.status === "string" ? body.status : undefined,
        cover_image_url:
          typeof body.cover_image_url === "string"
            ? body.cover_image_url
            : undefined,
      };

    const { error } = await supabase
      .from("itineraries")
      .update(updatePayload)
      .eq("id", itineraryId);

    if (error) throw error;

    return NextResponse.json({ message: "Itinerary updated" }, { status: 200 });
  } catch (error) {
    console.error("[Itinerary Detail PUT]", error);
    const isConfigError =
      (error as Error).message === "Missing Supabase configuration";
    return NextResponse.json(
      { error: (error as Error).message },
      { status: isConfigError ? 500 : 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const itineraryId = params.id;
    const { searchParams } = new URL(request.url);
    const requesterId = searchParams.get("user_id");

    if (!itineraryId || !requesterId) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      );
    }

    const supabase = getAdminClient();
    const membership = await getMembership(supabase, itineraryId, requesterId);

    if (!membership.isOwner) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { error } = await supabase
      .from("itineraries")
      .delete()
      .eq("id", itineraryId);

    if (error) throw error;

    return NextResponse.json({ message: "Itinerary deleted" }, { status: 200 });
  } catch (error) {
    console.error("[Itinerary Detail DELETE]", error);
    const isConfigError =
      (error as Error).message === "Missing Supabase configuration";
    return NextResponse.json(
      { error: (error as Error).message },
      { status: isConfigError ? 500 : 500 }
    );
  }
}
