import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// POST /api/referrals - Create a new referral
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
    const { referrer_id, candidate_id, opportunity_holder_id, context } = body;

    if (!referrer_id || !candidate_id || !opportunity_holder_id || !context) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate all three are different
    if (
      candidate_id === opportunity_holder_id ||
      referrer_id === candidate_id ||
      referrer_id === opportunity_holder_id
    ) {
      return NextResponse.json(
        { error: "All three parties must be different users" },
        { status: 400 }
      );
    }

    // Verify that both candidate and opportunity_holder are first-degree connections of referrer
    const { data: connections, error: connError } = await admin
      .from("connections")
      .select("requester_id, recipient_id, status, connection_type")
      .or(
        `and(requester_id.eq.${referrer_id},recipient_id.in.(${candidate_id},${opportunity_holder_id})),and(recipient_id.eq.${referrer_id},requester_id.in.(${candidate_id},${opportunity_holder_id}))`
      )
      .eq("status", "accepted");

    if (connError) throw connError;

    const candidateConnected = connections?.some(
      (c) =>
        c.connection_type === "first" &&
        ((c.requester_id === referrer_id && c.recipient_id === candidate_id) ||
          (c.recipient_id === referrer_id && c.requester_id === candidate_id))
    );

    const opportunityHolderConnected = connections?.some(
      (c) =>
        c.connection_type === "first" &&
        ((c.requester_id === referrer_id &&
          c.recipient_id === opportunity_holder_id) ||
          (c.recipient_id === referrer_id &&
            c.requester_id === opportunity_holder_id))
    );

    if (!candidateConnected || !opportunityHolderConnected) {
      return NextResponse.json(
        {
          error:
            "Both candidate and opportunity holder must be first-degree connections of the referrer",
        },
        { status: 400 }
      );
    }

    // Check for existing pending referral for same trio
    const { data: existingReferral, error: existingError } = await admin
      .from("referrals")
      .select("id")
      .eq("referrer_id", referrer_id)
      .eq("candidate_id", candidate_id)
      .eq("opportunity_holder_id", opportunity_holder_id)
      .eq("status", "pending")
      .maybeSingle();

    if (existingError) throw existingError;

    if (existingReferral) {
      return NextResponse.json(
        { error: "A pending referral already exists for these three users" },
        { status: 400 }
      );
    }

    // Create the referral
    const { data: referral, error: insertError } = await admin
      .from("referrals")
      .insert({
        referrer_id,
        candidate_id,
        opportunity_holder_id,
        context,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    return NextResponse.json(
      { referral, message: "Referral created successfully!" },
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

// GET /api/referrals?user_id=xxx - Get pending referrals for a user
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
    // Get pending referrals where user is candidate or opportunity_holder
    const { data: referrals, error: referralsError } = await admin
      .from("referrals")
      .select(
        `
        *,
        referrer:users!referrals_referrer_id_fkey(id, username, name, preferred_name, profile_image_url),
        candidate:users!referrals_candidate_id_fkey(id, username, name, preferred_name, profile_image_url),
        opportunity_holder:users!referrals_opportunity_holder_id_fkey(id, username, name, preferred_name, profile_image_url)
      `
      )
      .eq("status", "pending")
      .or(`candidate_id.eq.${userId},opportunity_holder_id.eq.${userId}`);

    if (referralsError) throw referralsError;

    // Add role field to each referral
    const mappedReferrals = referrals?.map((referral) => {
      const role =
        referral.candidate_id === userId ? "candidate" : "opportunity_holder";
      const otherParty =
        role === "candidate"
          ? referral.opportunity_holder
          : referral.candidate;
      const hasAccepted =
        role === "candidate"
          ? referral.candidate_accepted
          : referral.opportunity_holder_accepted;
      const otherHasAccepted =
        role === "candidate"
          ? referral.opportunity_holder_accepted
          : referral.candidate_accepted;

      return {
        ...referral,
        role,
        other_party: otherParty,
        has_accepted: hasAccepted,
        other_has_accepted: otherHasAccepted,
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
