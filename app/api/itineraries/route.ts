import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Database } from "@/types/supabase";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE;

  if (!url || !serviceKey) {
    throw new Error("Missing Supabase configuration");
  }

  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false },
  });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId =
      searchParams.get("user_id") ?? request.headers.get("x-user-id");

    if (!userId) {
      return NextResponse.json(
        { error: "Missing user_id parameter" },
        { status: 400 }
      );
    }

    const supabase = getAdminClient();

    const { data: owned, error: ownedError } = await supabase
      .from("itineraries")
      .select(
        `
        *,
        owner:users!itineraries_owner_id_fkey(id, username, name, preferred_name, profile_image_url),
        travelers:itinerary_travelers(id, user_id, email, role, invitation_status, notifications_enabled, color_hex)
      `
      )
      .eq("owner_id", userId)
      .order("start_date", { ascending: true });

    if (ownedError) throw ownedError;

    const { data: membershipRows, error: membershipError } = await supabase
      .from("itinerary_travelers")
      .select("itinerary_id")
      .eq("user_id", userId)
      .in("invitation_status", ["accepted", "pending"]);

    if (membershipError) throw membershipError;

    const memberIds = (membershipRows || [])
      .map((row) => row.itinerary_id)
      .filter((id) => !owned?.some((itinerary) => itinerary.id === id));

    let shared: typeof owned = [];

    if (memberIds.length > 0) {
      const { data: sharedData, error: sharedError } = await supabase
        .from("itineraries")
        .select(
          `
          *,
          owner:users!itineraries_owner_id_fkey(id, username, name, preferred_name, profile_image_url),
          travelers:itinerary_travelers(id, user_id, email, role, invitation_status, notifications_enabled, color_hex)
        `
        )
        .in("id", memberIds)
        .order("start_date", { ascending: true });

      if (sharedError) throw sharedError;

      shared = sharedData ?? [];
    }

    type ItineraryRecord = NonNullable<typeof owned>[number];
    const uniqueById = new Map<string, ItineraryRecord>();
    [...(owned ?? []), ...shared].forEach((item) => {
      uniqueById.set(item.id, item);
    });

    const combined = Array.from(uniqueById.values());
    combined.sort((a, b) => {
      const left = a.start_date
        ? new Date(a.start_date).getTime()
        : Number.MAX_SAFE_INTEGER;
      const right = b.start_date
        ? new Date(b.start_date).getTime()
        : Number.MAX_SAFE_INTEGER;
      return left - right;
    });

    return NextResponse.json({ data: combined }, { status: 200 });
  } catch (error) {
    console.error("[Itineraries API GET]", error);
    return NextResponse.json(
      { error: (error as Error).message },
      {
        status:
          (error as Error).message === "Missing Supabase configuration"
            ? 500
            : 500,
      }
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const {
      owner_id: ownerId,
      title,
      description,
      summary,
      start_date: startDate,
      end_date: endDate,
      timezone,
      visibility,
      status,
      cover_image_url: coverImageUrl,
      travelers,
    } = payload ?? {};

    if (!ownerId || !title) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const supabase = getAdminClient();

    const { data: inserted, error: insertError } = await supabase
      .from("itineraries")
      .insert({
        owner_id: ownerId,
        title,
        description,
        summary,
        start_date: startDate,
        end_date: endDate,
        timezone,
        visibility,
        status,
        cover_image_url: coverImageUrl,
      })
      .select("*")
      .single();

    if (insertError) throw insertError;

    const itineraryId = inserted.id;
    const travelerMap = new Map<
      string,
      Database["public"]["Tables"]["itinerary_travelers"]["Insert"]
    >();

    travelerMap.set(`user:${ownerId}`, {
      itinerary_id: itineraryId,
      user_id: ownerId,
      role: "owner",
      invitation_status: "accepted",
      notifications_enabled: true,
    });

    if (Array.isArray(travelers)) {
      travelers.forEach((traveler: any) => {
        if (!traveler) return;
        const userId =
          typeof traveler.user_id === "string" ? traveler.user_id : null;
        const email =
          typeof traveler.email === "string" ? traveler.email : null;
        if (!userId && !email) return;
        if (userId === ownerId) return;

        const key = userId
          ? `user:${userId}`
          : email
          ? `email:${email.toLowerCase()}`
          : null;

        if (!key || travelerMap.has(key)) return;

        travelerMap.set(key, {
          itinerary_id: itineraryId,
          user_id: userId ?? undefined,
          email: email ?? undefined,
          role: typeof traveler.role === "string" ? traveler.role : "traveler",
          invitation_status:
            typeof traveler.invitation_status === "string"
              ? traveler.invitation_status
              : "pending",
          notifications_enabled:
            typeof traveler.notifications_enabled === "boolean"
              ? traveler.notifications_enabled
              : true,
          color_hex:
            typeof traveler.color_hex === "string"
              ? traveler.color_hex
              : undefined,
        });
      });
    }

    const travelerInputs = Array.from(travelerMap.values());

    if (travelerInputs.length > 0) {
      const { error: travelersError } = await supabase
        .from("itinerary_travelers")
        .insert(travelerInputs);

      if (travelersError && travelersError.code !== "23505") {
        throw travelersError;
      }
    }

    const { data: itinerary, error: fetchError } = await supabase
      .from("itineraries")
      .select(
        `
        *,
        owner:users!itineraries_owner_id_fkey(id, username, name, preferred_name, profile_image_url),
        travelers:itinerary_travelers(id, user_id, email, role, invitation_status, notifications_enabled, color_hex)
      `
      )
      .eq("id", itineraryId)
      .single();

    if (fetchError) throw fetchError;

    return NextResponse.json(
      { data: itinerary, message: "Itinerary created successfully!" },
      { status: 201 }
    );
  } catch (error) {
    console.error("[Itineraries API POST]", error);
    const code = (error as any)?.code;
    const status =
      code === "23505"
        ? 409
        : (error as Error).message === "Missing Supabase configuration"
        ? 500
        : 500;
    return NextResponse.json({ error: (error as Error).message }, { status });
  }
}
