import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

function sanitizeForOr(value: string, maxLen = 128) {
  const cleaned = value.replace(/[(),]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, maxLen);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const qRaw = searchParams.get("q") ?? "";
  const requesterId = searchParams.get("requesterId") ?? undefined;
  const q = sanitizeForOr(qRaw);

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
    // Gather blocked relationships if requester provided
    const blockedIds = new Set<string>();
    if (requesterId) {
      const [{ data: iBlocked, error: e1 }, { data: blockedMe, error: e2 }] =
        await Promise.all([
          admin
            .from("blocked_users")
            .select("blocked_id")
            .eq("blocker_id", requesterId),
          admin
            .from("blocked_users")
            .select("blocker_id")
            .eq("blocked_id", requesterId),
        ]);

      if (!e1 && iBlocked) {
        iBlocked.forEach((r: { blocked_id: string }) =>
          blockedIds.add(r.blocked_id)
        );
      }
      if (!e2 && blockedMe) {
        blockedMe.forEach((r: { blocker_id: string }) =>
          blockedIds.add(r.blocker_id)
        );
      }
    }

    // Base user query
    let query = admin
      .from("users")
      .select("id, username, name, preferred_name, profile_image_url")
      .order("username", { ascending: true })
      .limit(50);

    if (q) {
      query = query.or(
        `username.ilike.%${q}%,name.ilike.%${q}%,preferred_name.ilike.%${q}%`
      );
    }
    if (requesterId) {
      query = query.neq("id", requesterId);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }

    const rows = (data || []).filter((u) => !blockedIds.has(u.id)).slice(0, 20);
    return NextResponse.json({ data: rows }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { error: { message: (e as Error).message } },
      { status: 500 }
    );
  }
}
