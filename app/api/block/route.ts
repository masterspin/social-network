import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

export async function POST(request: Request) {
  const { blockerId, blockedId, action } = await request.json();
  if (!blockerId || !blockedId) {
    return NextResponse.json(
      { error: { message: "Missing blockerId or blockedId" } },
      { status: 400 }
    );
  }

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
    if (action === "unblock") {
      // Remove block record
      const { error } = await admin
        .from("blocked_users")
        .delete()
        .eq("blocker_id", blockerId)
        .eq("blocked_id", blockedId);
      if (error) return NextResponse.json({ error }, { status: 400 });
      return NextResponse.json({ data: { unblocked: true } }, { status: 200 });
    }

    // Default: block
    // 1) Upsert block record
    const { error: upsertErr } = await admin
      .from("blocked_users")
      .upsert(
        { blocker_id: blockerId, blocked_id: blockedId },
        { onConflict: "blocker_id,blocked_id" }
      );
    if (upsertErr)
      return NextResponse.json({ error: upsertErr }, { status: 400 });

    // 2) Remove any connections between the two users (both directions)
    const { error: delErr } = await admin
      .from("connections")
      .delete()
      .or(
        `and(requester_id.eq.${blockerId},recipient_id.eq.${blockedId}),and(requester_id.eq.${blockedId},recipient_id.eq.${blockerId})`
      );
    if (delErr) return NextResponse.json({ error: delErr }, { status: 400 });

    return NextResponse.json({ data: { blocked: true } }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { error: { message: (e as Error).message } },
      { status: 500 }
    );
  }
}
