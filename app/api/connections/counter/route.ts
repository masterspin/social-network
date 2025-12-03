import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

// Counter an incoming pending request by flipping direction safely.
// Body: { connectionId: string, currentUserId: string, how_met: string }
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE;

  if (!url || !serviceKey) {
    return NextResponse.json(
      {
        error: {
          message:
            "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE in server environment",
        },
      },
      { status: 500 }
    );
  }

  const admin = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false },
  });

  try {
    const { connectionId, currentUserId, how_met } = await request.json();
    if (!connectionId || !currentUserId || typeof how_met !== "string") {
      return NextResponse.json(
        { error: { message: "Missing connectionId/currentUserId/how_met" } },
        { status: 400 }
      );
    }

    // Load the original connection
    const { data: conn, error: e1 } = await admin
      .from("connections")
      .select("id, requester_id, recipient_id, status")
      .eq("id", connectionId)
      .single();
    if (e1) return NextResponse.json({ error: e1 }, { status: 400 });
    if (!conn) return NextResponse.json({ data: null }, { status: 200 });

    // Validate it's an incoming pending to current user
    if (conn.recipient_id !== currentUserId || conn.status !== "pending") {
      return NextResponse.json(
        { error: { message: "Connection not amendable by user" } },
        { status: 403 }
      );
    }

    const otherId = conn.requester_id;

    // Check if a reversed row already exists
    const { data: existingReverse, error: e2 } = await admin
      .from("connections")
      .select("id")
      .eq("requester_id", currentUserId)
      .eq("recipient_id", otherId)
      .maybeSingle();
    if (e2) return NextResponse.json({ error: e2 }, { status: 400 });

    if (existingReverse && existingReverse.id !== conn.id) {
      // Update the existing reverse, remove the original
      const up = await admin
        .from("connections")
        .update({ how_met, status: "pending" })
        .eq("id", existingReverse.id)
        .select()
        .single();
      if (up.error)
        return NextResponse.json({ error: up.error }, { status: 400 });

      const del = await admin.from("connections").delete().eq("id", conn.id);
      if (del.error)
        return NextResponse.json({ error: del.error }, { status: 400 });

      return NextResponse.json({ data: up.data }, { status: 200 });
    }

    // Try swapping requester/recipient in-place
    const upd = await admin
      .from("connections")
      .update({
        requester_id: currentUserId,
        recipient_id: otherId,
        how_met,
        status: "pending",
      })
      .eq("id", conn.id)
      .select()
      .single();
    if (upd.error)
      return NextResponse.json({ error: upd.error }, { status: 400 });

    return NextResponse.json({ data: upd.data }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { error: { message: (e as Error).message } },
      { status: 500 }
    );
  }
}
