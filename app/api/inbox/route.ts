import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) {
    return NextResponse.json(
      { error: { message: "Missing userId" } },
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
    const baseSelect = `
      *,
      requester:users!connections_requester_id_fkey(id, username, name, preferred_name, profile_image_url),
      recipient:users!connections_recipient_id_fkey(id, username, name, preferred_name, profile_image_url),
      met_through:users!connections_met_through_id_fkey(id, username, name, preferred_name)
    `;

    const [rec, snt] = await Promise.all([
      admin
        .from("connections")
        .select(baseSelect)
        .eq("recipient_id", userId)
        .eq("status", "pending"),
      admin
        .from("connections")
        .select(baseSelect)
        .eq("requester_id", userId)
        .eq("status", "pending"),
    ]);

    if (rec.error)
      return NextResponse.json({ error: rec.error }, { status: 400 });
    if (snt.error)
      return NextResponse.json({ error: snt.error }, { status: 400 });

    return NextResponse.json(
      { data: { received: rec.data || [], sent: snt.data || [] } },
      { status: 200 }
    );
  } catch (e) {
    return NextResponse.json(
      { error: { message: (e as Error).message } },
      { status: 500 }
    );
  }
}
