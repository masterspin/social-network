import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// PATCH /api/referrals/update-message - Update candidate message before opportunity holder accepts
export async function PATCH(request: Request) {
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
    const { referral_id, user_id, message } = body;

    if (!referral_id || !user_id || typeof message !== "string") {
      return NextResponse.json(
        { error: "Missing required fields (referral_id, user_id, message)" },
        { status: 400 }
      );
    }

    if (!message.trim()) {
      return NextResponse.json(
        { error: "Message cannot be empty" },
        { status: 400 }
      );
    }

    // Fetch the referral to validate conditions
    const { data: referral, error: fetchError } = await admin
      .from("referrals")
      .select("*")
      .eq("id", referral_id)
      .single();

    if (fetchError || !referral) {
      return NextResponse.json(
        { error: "Referral not found" },
        { status: 404 }
      );
    }

    // Validate conditions
    if (referral.candidate_id !== user_id) {
      return NextResponse.json(
        { error: "Only the candidate can edit the greeting message" },
        { status: 403 }
      );
    }

    if (referral.status !== "pending") {
      return NextResponse.json(
        { error: "Cannot edit message - referral is no longer pending" },
        { status: 400 }
      );
    }

    if (referral.opportunity_holder_accepted) {
      return NextResponse.json(
        { error: "Cannot edit message - opportunity holder has already accepted" },
        { status: 400 }
      );
    }

    // Update the message
    const { error: updateError } = await admin
      .from("referrals")
      .update({ candidate_message: message })
      .eq("id", referral_id);

    if (updateError) throw updateError;

    return NextResponse.json(
      { message: "Greeting message updated successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error("[Referrals Update Message API] Error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
