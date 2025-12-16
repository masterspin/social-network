import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/supabase";

type TypedSupabaseClient = SupabaseClient<Database>;

type Membership = {
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
    const segmentId = searchParams.get("segment_id");

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

    let query = supabase
      .from("itinerary_comments")
      .select(
        `
        *,
        author:users!itinerary_comments_author_id_fkey(id, username, name, preferred_name, profile_image_url)
      `
      )
      .eq("itinerary_id", itineraryId)
      .order("created_at", { ascending: true });

    if (segmentId) {
      query = query.eq("segment_id", segmentId);
    }

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error("[Itinerary Comments GET]", error);
    const isConfigError =
      (error as Error).message === "Missing Supabase configuration";
    return NextResponse.json(
      { error: (error as Error).message },
      { status: isConfigError ? 500 : 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const itineraryId = params.id;
    const body = await request.json();
    const authorId = body?.user_id as string | undefined;

    if (!itineraryId || !authorId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (typeof body.body !== "string" || body.body.trim().length === 0) {
      return NextResponse.json(
        { error: "Comment body is required" },
        { status: 400 }
      );
    }

    const supabase = getAdminClient();
    const membership = await checkMembership(supabase, itineraryId, authorId);

    if (!membership.isMember) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const insertPayload: Database["public"]["Tables"]["itinerary_comments"]["Insert"] =
      {
        itinerary_id: itineraryId,
        segment_id:
          typeof body.segment_id === "string" && body.segment_id.length > 0
            ? body.segment_id
            : null,
        author_id: authorId,
        body: body.body.trim(),
        parent_comment_id:
          typeof body.parent_comment_id === "string" &&
          body.parent_comment_id.length > 0
            ? body.parent_comment_id
            : null,
        is_private:
          typeof body.is_private === "boolean" ? body.is_private : false,
      };

    const { data, error } = await supabase
      .from("itinerary_comments")
      .insert(insertPayload)
      .select(
        `
        *,
        author:users!itinerary_comments_author_id_fkey(id, username, name, preferred_name, profile_image_url)
      `
      )
      .single();

    if (error) throw error;

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error("[Itinerary Comments POST]", error);
    const isConfigError =
      (error as Error).message === "Missing Supabase configuration";
    return NextResponse.json(
      { error: (error as Error).message },
      { status: isConfigError ? 500 : 500 }
    );
  }
}
