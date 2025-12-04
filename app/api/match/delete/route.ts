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

    // Update the chat status to inactive
    const { error } = await admin
      .from("match_chats")
      .update({
        is_active: false,
        deleted_at: new Date().toISOString(),
      })
      .eq("match_id", match_id)
      .eq("user_id", user_id);

    if (error) throw error;

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
