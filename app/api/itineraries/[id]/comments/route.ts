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
        console.warn(
          "[Itinerary Comments] Failed to resolve user from token",
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

  return { isOwner: isCoOwner, isMember: Boolean(membership) };
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id: itineraryId } = await context.params;

    if (process.env.NEXT_PUBLIC_DEV_MODE === "true") {
      const { MOCK_ITINERARIES } = await import("@/lib/dev/mock-data");
      const itinerary = MOCK_ITINERARIES.find((item) => item.id === itineraryId);

      if (!itinerary) {
        return NextResponse.json(
          { error: "Itinerary not found" },
          { status: 404 }
        );
      }

      return NextResponse.json({ data: [] }, { status: 200 });
    }

    const userId = await resolveUserId(request);
    const { searchParams } = new URL(request.url);
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

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id: itineraryId } = await context.params;
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
