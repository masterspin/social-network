import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// POST /api/match/delete - Delete/leave a match chat
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
    const { match_id, user_id } = body;

    if (!match_id || !user_id) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const { data: match, error: matchFetchError } = await admin
      .from("matches")
      .select("id, user1_id, user2_id")
      .eq("id", match_id)
      .maybeSingle();

    if (matchFetchError) throw matchFetchError;

    if (!match) {
      return NextResponse.json(
        { error: "Match not found" },
        { status: 404 }
      );
    }

    const isParticipant =
      match.user1_id === user_id || match.user2_id === user_id;

    if (!isParticipant) {
      return NextResponse.json(
        { error: "User is not a participant in this chat" },
        { status: 403 }
      );
    }

    const { error: deleteMatchError } = await admin
      .from("matches")
      .delete()
      .eq("id", match_id);

    if (deleteMatchError) throw deleteMatchError;

    return NextResponse.json(
      { message: "Chat deleted successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error("[Match Delete API] Error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
