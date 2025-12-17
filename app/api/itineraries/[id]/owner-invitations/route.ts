import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/supabase";

type TypedSupabaseClient = SupabaseClient<Database>;

type RouteContext = {
  params: Promise<{ id: string }>;
};

type Membership = {
  isOwner: boolean;
};

function getAdminClient(): TypedSupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE;

  if (!url || !serviceKey) {
    throw new Error("Missing Supabase configuration");
  }

  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false },
  });
}

async function resolveUserId(request: Request): Promise<string | null> {
  const { searchParams } = new URL(request.url);
  const candidates = [
    searchParams.get("user_id"),
    request.headers.get("x-user-id"),
    request.headers.get("X-User-Id"),
    request.headers.get("X-USER-ID"),
  ].filter((value): value is string =>
    Boolean(value && value !== "undefined" && value !== "null")
  );

  if (candidates.length > 0) {
    return candidates[0];
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      process.env.SUPABASE_ANON_KEY ??
      null;

    if (url && anonKey && token) {
      try {
        const authClient = createClient<Database>(url, anonKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data, error } = await authClient.auth.getUser(token);
        if (!error && data?.user?.id) {
          return data.user.id;
        }
      } catch (reason) {
        console.warn(
          "[Owner Invitations] Failed to resolve user from token",
          reason
        );
      }
    }
  }

  return null;
}

async function getMembership(
  supabase: TypedSupabaseClient,
  itineraryId: string,
  userId: string
): Promise<Membership> {
  const { data: itinerary } = await supabase
    .from("itineraries")
    .select("owner_id")
    .eq("id", itineraryId)
    .single();

  if (!itinerary) {
    return { isOwner: false };
  }

  if (itinerary.owner_id === userId) {
    return { isOwner: true };
  }

  const { data: membership } = await supabase
    .from("itinerary_travelers")
    .select("role, invitation_status")
    .eq("itinerary_id", itineraryId)
    .eq("user_id", userId)
    .maybeSingle();

  const isCoOwner =
    membership?.role === "owner" &&
    membership?.invitation_status === "accepted";

  return { isOwner: Boolean(isCoOwner) };
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id: itineraryId } = await context.params;
    const userId = await resolveUserId(request);

    if (!itineraryId || !userId) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      );
    }

    const supabase = getAdminClient();
    const membership = await getMembership(supabase, itineraryId, userId);

    if (!membership.isOwner) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("itinerary_owner_invitations")
      .select(
        `
        *,
        invitee:users!itinerary_owner_invitations_invitee_id_fkey(id, username, name, preferred_name, profile_image_url),
        inviter:users!itinerary_owner_invitations_inviter_id_fkey(id, username, name, preferred_name, profile_image_url)
      `
      )
      .eq("itinerary_id", itineraryId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error("[Owner Invitations GET]", error);
    const isConfigError =
      (error as Error).message === "Missing Supabase configuration";
    return NextResponse.json(
      { error: (error as Error).message },
      { status: isConfigError ? 500 : 500 }
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id: itineraryId } = await context.params;
    const body = await request.json();
    const ownerId = body?.owner_id as string | undefined;
    const inviteeId = body?.invitee_id as string | undefined;

    if (!itineraryId || !ownerId || !inviteeId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const resolvedUserId = await resolveUserId(request);

    if (!resolvedUserId || resolvedUserId !== ownerId) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const supabase = getAdminClient();
    const membership = await getMembership(supabase, itineraryId, ownerId);

    if (!membership.isOwner) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    if (ownerId === inviteeId) {
      return NextResponse.json(
        { error: "You cannot invite yourself" },
        { status: 400 }
      );
    }

    const { data: itinerary } = await supabase
      .from("itineraries")
      .select("owner_id")
      .eq("id", itineraryId)
      .single();

    if (!itinerary) {
      return NextResponse.json(
        { error: "Itinerary not found" },
        { status: 404 }
      );
    }

    if (itinerary.owner_id === inviteeId) {
      return NextResponse.json(
        { error: "This user is already an owner" },
        { status: 409 }
      );
    }

    const { data: existingTraveler } = await supabase
      .from("itinerary_travelers")
      .select("id, role, invitation_status")
      .eq("itinerary_id", itineraryId)
      .eq("user_id", inviteeId)
      .maybeSingle();

    if (
      existingTraveler?.role === "owner" &&
      existingTraveler?.invitation_status === "accepted"
    ) {
      return NextResponse.json(
        { error: "This user is already an owner" },
        { status: 409 }
      );
    }

    const { data: pendingInvite } = await supabase
      .from("itinerary_owner_invitations")
      .select("id, status")
      .eq("itinerary_id", itineraryId)
      .eq("invitee_id", inviteeId)
      .eq("status", "pending")
      .maybeSingle();

    if (pendingInvite) {
      return NextResponse.json(
        { error: "An invitation is already pending" },
        { status: 409 }
      );
    }

    let upsertTravelerError = null;
    if (existingTraveler) {
      const { error } = await supabase
        .from("itinerary_travelers")
        .update({ role: "owner", invitation_status: "pending" })
        .eq("id", existingTraveler.id);
      upsertTravelerError = error;
    } else {
      const { error } = await supabase.from("itinerary_travelers").insert({
        itinerary_id: itineraryId,
        user_id: inviteeId,
        role: "owner",
        invitation_status: "pending",
        notifications_enabled: true,
      });
      upsertTravelerError = error;
    }

    if (upsertTravelerError) throw upsertTravelerError;

    const { data, error } = await supabase
      .from("itinerary_owner_invitations")
      .insert({
        itinerary_id: itineraryId,
        inviter_id: ownerId,
        invitee_id: inviteeId,
        status: "pending",
      })
      .select(
        `
        *,
        invitee:users!itinerary_owner_invitations_invitee_id_fkey(id, username, name, preferred_name, profile_image_url),
        inviter:users!itinerary_owner_invitations_inviter_id_fkey(id, username, name, preferred_name, profile_image_url)
      `
      )
      .single();

    if (error) throw error;

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error("[Owner Invitations POST]", error);
    const isConfigError =
      (error as Error).message === "Missing Supabase configuration";
    return NextResponse.json(
      { error: (error as Error).message },
      { status: isConfigError ? 500 : 500 }
    );
  }
}
