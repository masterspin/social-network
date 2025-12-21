import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/supabase";

type TypedSupabaseClient = SupabaseClient<Database>;

type RouteContext = {
  params: Promise<{ id: string; commentId: string }>;
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
          "[Itinerary Comment]",
          "Failed to resolve user from token",
          reason
        );
      }
    }
  }

  return null;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id: itineraryId, commentId } = await context.params;
    const body = await request.json();
    const userId = body?.user_id as string | undefined;

    if (!itineraryId || !commentId || !userId) {
      return NextResponse.json(
        { error: "Missing required parameters" },
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

    // Verify comment exists and user is the author
    const { data: existingComment, error: fetchError } = await supabase
      .from("itinerary_comments")
      .select("author_id, itinerary_id")
      .eq("id", commentId)
      .single();

    if (fetchError || !existingComment) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    if (existingComment.author_id !== userId) {
      return NextResponse.json(
        { error: "Not authorized to edit this comment" },
        { status: 403 }
      );
    }

    if (existingComment.itinerary_id !== itineraryId) {
      return NextResponse.json(
        { error: "Comment does not belong to this itinerary" },
        { status: 400 }
      );
    }

    // Update the comment
    const { data, error } = await supabase
      .from("itinerary_comments")
      .update({ body: body.body.trim() })
      .eq("id", commentId)
      .select(
        `
        *,
        author:users!itinerary_comments_author_id_fkey(id, username, name, preferred_name, profile_image_url)
      `
      )
      .single();

    if (error) throw error;

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error("[Itinerary Comment PATCH]", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { id: itineraryId, commentId } = await context.params;
    const body = await request.json();
    const userId = body?.user_id as string | undefined;

    if (!itineraryId || !commentId || !userId) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      );
    }

    const supabase = getAdminClient();

    // Verify comment exists and user is the author
    const { data: existingComment, error: fetchError } = await supabase
      .from("itinerary_comments")
      .select("author_id, itinerary_id")
      .eq("id", commentId)
      .single();

    if (fetchError || !existingComment) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    if (existingComment.author_id !== userId) {
      return NextResponse.json(
        { error: "Not authorized to delete this comment" },
        { status: 403 }
      );
    }

    if (existingComment.itinerary_id !== itineraryId) {
      return NextResponse.json(
        { error: "Comment does not belong to this itinerary" },
        { status: 400 }
      );
    }

    // Delete the comment
    const { error } = await supabase
      .from("itinerary_comments")
      .delete()
      .eq("id", commentId);

    if (error) throw error;

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("[Itinerary Comment DELETE]", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
