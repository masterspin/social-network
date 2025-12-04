import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// POST /api/match - Create a new match between two users
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE;

  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: "Missing Supabase configuration" },
      { status: 500 }
    );
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  try {
    const body = await request.json();
    const { matchmaker_id, user1_id, user2_id } = body;

    if (!matchmaker_id || !user1_id || !user2_id) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Verify that both users are first connections of the matchmaker
    const { data: connections, error: connError } = await admin
      .from("connections")
      .select("requester_id, recipient_id, status, connection_type")
      .or(
        `and(requester_id.eq.${matchmaker_id},recipient_id.in.(${user1_id},${user2_id})),and(recipient_id.eq.${matchmaker_id},requester_id.in.(${user1_id},${user2_id}))`
      )
      .eq("status", "accepted");

    if (connError) throw connError;

    // Check that we have 2 connections and both are "first" type
    const user1Connected = connections?.some(
      (c) =>
        c.connection_type === "first" &&
        ((c.requester_id === matchmaker_id && c.recipient_id === user1_id) ||
          (c.recipient_id === matchmaker_id && c.requester_id === user1_id))
    );

    const user2Connected = connections?.some(
      (c) =>
        c.connection_type === "first" &&
        ((c.requester_id === matchmaker_id && c.recipient_id === user2_id) ||
          (c.recipient_id === matchmaker_id && c.requester_id === user2_id))
    );

    if (!user1Connected || !user2Connected) {
      return NextResponse.json(
        {
          error:
            "Both users must be first connections of the matchmaker",
        },
        { status: 400 }
      );
    }

    // Call the stored function to create the match
    const { data, error } = await admin.rpc("create_match", {
      p_matchmaker_id: matchmaker_id,
      p_user1_id: user1_id,
      p_user2_id: user2_id,
    });

    if (error) {
      if (error.code === "23505") {
        // Unique constraint violation
        return NextResponse.json(
          { error: "These users are already matched" },
          { status: 400 }
        );
      }
      throw error;
    }

    return NextResponse.json({ match_id: data }, { status: 201 });
  } catch (error) {
    console.error("[Match API] Error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

// GET /api/match?user_id=xxx - Get matches for a user
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("user_id");

  if (!userId) {
    return NextResponse.json(
      { error: "Missing user_id parameter" },
      { status: 400 }
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE;

  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: "Missing Supabase configuration" },
      { status: 500 }
    );
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  try {
    // Get all matches where user is involved
    const { data: matches, error: matchError } = await admin
      .from("matches")
      .select(
        `
        *,
        matchmaker:users!matches_matchmaker_id_fkey(id, username, name, preferred_name, profile_image_url),
        user1:users!matches_user1_id_fkey(id, username, name, preferred_name, profile_image_url),
        user2:users!matches_user2_id_fkey(id, username, name, preferred_name, profile_image_url)
      `
      )
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`);

    if (matchError) throw matchError;

    // Get chat status for each match
    const matchIds = matches?.map((m) => m.id) || [];
    const { data: chatStatuses, error: chatError } = await admin
      .from("match_chats")
      .select("match_id, user_id, is_active, deleted_at")
      .eq("user_id", userId)
      .in("match_id", matchIds);

    if (chatError) throw chatError;

    // Combine data
    const result = matches?.map((match) => {
      const chatStatus = chatStatuses?.find((c) => c.match_id === match.id);
      const otherUser =
        match.user1_id === userId ? match.user2 : match.user1;

      return {
        id: match.id,
        matchmaker: match.matchmaker,
        other_user: otherUser,
        is_active: chatStatus?.is_active || false,
        deleted_at: chatStatus?.deleted_at,
        created_at: match.created_at,
      };
    });

    return NextResponse.json({ data: result }, { status: 200 });
  } catch (error) {
    console.error("[Match API GET] Error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
