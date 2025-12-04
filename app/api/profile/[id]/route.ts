import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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
    const userId = id;
    if (!userId) {
      return NextResponse.json(
        { error: { message: "Missing user id" } },
        { status: 400 }
      );
    }

    const [{ data: user, error: e1 }, { data: links, error: e2 }] =
      await Promise.all([
        admin
          .from("users")
          .select(
            "id, username, name, preferred_name, profile_image_url, bio, gender"
          )
          .eq("id", userId)
          .single(),
        admin
          .from("social_links")
          .select("id, platform, url")
          .eq("user_id", userId),
      ]);

    if (e1) {
      // Supabase returns an error if .single() results in zero rows.
      // That's how we'll know the user doesn't exist.
      return NextResponse.json({ error: e1 }, { status: 404 });
    }
    if (!user) {
      // This case might not even be reachable if e1 handles the not-found case.
      return NextResponse.json({ data: null }, { status: 404 });
    }
    if (e2) return NextResponse.json({ error: e2 }, { status: 400 });

    return NextResponse.json(
      { data: { user, links: links || [] } },
      { status: 200 }
    );
  } catch (e) {
    return NextResponse.json(
      { error: { message: (e as Error).message } },
      { status: 500 }
    );
  }
}
