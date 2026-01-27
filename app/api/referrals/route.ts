import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// POST /api/referrals - Create a referral (immediately connects both users)
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
    const { referrer_id, user1_id, user2_id, context } = body;

    if (!referrer_id || !user1_id || !user2_id || !context) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate all three are different
    if (
      user1_id === user2_id ||
      referrer_id === user1_id ||
      referrer_id === user2_id
    ) {
      return NextResponse.json(
        { error: "All three parties must be different users" },
        { status: 400 }
      );
    }

    // Verify both users are first-degree connections of referrer
    const { data: connections, error: connError } = await admin
      .from("connections")
      .select("requester_id, recipient_id, status, connection_type")
      .or(
        `and(requester_id.eq.${referrer_id},recipient_id.in.(${user1_id},${user2_id})),and(recipient_id.eq.${referrer_id},requester_id.in.(${user1_id},${user2_id}))`
      )
      .eq("status", "accepted");

    if (connError) throw connError;

    const user1Connected = connections?.some(
      (c) =>
        c.connection_type === "first" &&
        ((c.requester_id === referrer_id && c.recipient_id === user1_id) ||
          (c.recipient_id === referrer_id && c.requester_id === user1_id))
    );

    const user2Connected = connections?.some(
      (c) =>
        c.connection_type === "first" &&
        ((c.requester_id === referrer_id && c.recipient_id === user2_id) ||
          (c.recipient_id === referrer_id && c.requester_id === user2_id))
    );

    if (!user1Connected || !user2Connected) {
      return NextResponse.json(
        {
          error:
            "Both users must be first-degree connections of the referrer",
        },
        { status: 400 }
      );
    }

    // Handle existing match (same logic as match API)
    const [lowerUserId, higherUserId] =
      user1_id < user2_id ? [user1_id, user2_id] : [user2_id, user1_id];

    const { data: existingMatch, error: existingMatchError } = await admin
      .from("matches")
      .select("id")
      .eq("user1_id", lowerUserId)
      .eq("user2_id", higherUserId)
      .maybeSingle();

    if (existingMatchError) throw existingMatchError;

    if (existingMatch) {
      const { data: chatStatuses, error: chatStatusesError } = await admin
        .from("match_chats")
        .select("is_active")
        .eq("match_id", existingMatch.id);

      if (chatStatusesError) throw chatStatusesError;

      const hasActiveChat = chatStatuses?.some((row) => row.is_active);

      if (hasActiveChat) {
        // Already connected — create referral record pointing to existing match
        const { data: referral, error: insertError } = await admin
          .from("referrals")
          .insert({
            referrer_id,
            user1_id: lowerUserId,
            user2_id: higherUserId,
            context,
            match_id: existingMatch.id,
          })
          .select()
          .single();

        if (insertError) throw insertError;

        return NextResponse.json(
          { referral, match_id: existingMatch.id, message: "Referral created! These users are already connected." },
          { status: 201 }
        );
      }

      // Inactive match — delete and re-create
      const { error: deleteError } = await admin
        .from("matches")
        .delete()
        .eq("id", existingMatch.id);

      if (deleteError) throw deleteError;
    }

    // Create match via stored function
    const { data: matchId, error: matchError } = await admin.rpc(
      "create_match",
      {
        p_matchmaker_id: referrer_id,
        p_user1_id: user1_id,
        p_user2_id: user2_id,
      }
    );

    if (matchError) throw matchError;

    // Create referral record
    const { data: referral, error: insertError } = await admin
      .from("referrals")
      .insert({
        referrer_id,
        user1_id: lowerUserId,
        user2_id: higherUserId,
        context,
        match_id: matchId,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    return NextResponse.json(
      { referral, match_id: matchId, message: "Referral created successfully!" },
      { status: 201 }
    );
  } catch (error) {
    console.error("[Referrals API POST] Error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

// DELETE /api/referrals - Delete a referral
export async function DELETE(request: Request) {
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
    const { referral_id, user_id } = body;

    if (!referral_id || !user_id) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Verify user is user1 or user2 on the referral
    const { data: referral, error: fetchError } = await admin
      .from("referrals")
      .select("id, user1_id, user2_id")
      .eq("id", referral_id)
      .single();

    if (fetchError || !referral) {
      return NextResponse.json(
        { error: "Referral not found" },
        { status: 404 }
      );
    }

    if (referral.user1_id !== user_id && referral.user2_id !== user_id) {
      return NextResponse.json(
        { error: "Not authorized to delete this referral" },
        { status: 403 }
      );
    }

    const { error: deleteError } = await admin
      .from("referrals")
      .delete()
      .eq("id", referral_id);

    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("[Referrals API DELETE] Error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

// GET /api/referrals?user_id=xxx - Get referrals for a user
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("user_id");

  if (!userId) {
    return NextResponse.json(
      { error: "Missing user_id parameter" },
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
    const { data: referrals, error: referralsError } = await admin
      .from("referrals")
      .select(
        `
        *,
        referrer:users!referrals_referrer_id_fkey(id, username, name, preferred_name, profile_image_url),
        user1:users!referrals_user1_id_fkey(id, username, name, preferred_name, profile_image_url),
        user2:users!referrals_user2_id_fkey(id, username, name, preferred_name, profile_image_url)
      `
      )
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
      .order("created_at", { ascending: false });

    if (referralsError) throw referralsError;

    // Map to include the other party for convenience
    const mappedReferrals = referrals?.map((referral) => {
      const otherUser =
        referral.user1_id === userId ? referral.user2 : referral.user1;
      return {
        ...referral,
        other_user: otherUser,
      };
    });

    return NextResponse.json({ data: mappedReferrals }, { status: 200 });
  } catch (error) {
    console.error("[Referrals API GET] Error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
