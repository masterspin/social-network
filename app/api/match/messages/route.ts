import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// GET /api/match/messages?match_id=xxx - Get messages for a match
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const matchId = searchParams.get("match_id");

  if (!matchId) {
    return NextResponse.json(
      { error: "Missing match_id parameter" },
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
    const { data, error } = await admin
      .from("match_messages")
      .select(
        `
        *,
        sender:users!match_messages_sender_id_fkey(id, username, name, preferred_name, profile_image_url)
      `
      )
      .eq("match_id", matchId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error("[Match Messages API GET] Error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

// POST /api/match/messages - Send a message in a match
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
    const { match_id, sender_id, message } = body;

    if (!match_id || !sender_id || !message) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Verify that the sender has an active chat for this match
    const { data: chatStatus, error: chatError } = await admin
      .from("match_chats")
      .select("is_active")
      .eq("match_id", match_id)
      .eq("user_id", sender_id)
      .single();

    if (chatError || !chatStatus?.is_active) {
      return NextResponse.json(
        { error: "Chat is not active or does not exist" },
        { status: 403 }
      );
    }

    // Insert the message
    const { data, error } = await admin
      .from("match_messages")
      .insert({
        match_id,
        sender_id,
        message,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error("[Match Messages API POST] Error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
