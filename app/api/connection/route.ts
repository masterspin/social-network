import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const a = searchParams.get("a");
  const b = searchParams.get("b");

  if (!a || !b) {
    return NextResponse.json(
      { error: { message: "Missing user pair (a, b)" } },
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
    const select = `
      *,
      requester:users!connections_requester_id_fkey(id, username, name, preferred_name, profile_image_url),
      recipient:users!connections_recipient_id_fkey(id, username, name, preferred_name, profile_image_url)
    `;

    const { data, error } = await admin
      .from("connections")
      .select(select)
      .or(
        `and(requester_id.eq.${a},recipient_id.eq.${b}),and(requester_id.eq.${b},recipient_id.eq.${a})`
      )
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return NextResponse.json({ error }, { status: 400 });
    return NextResponse.json({ data: data || null }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { error: { message: (e as Error).message } },
      { status: 500 }
    );
  }
}
