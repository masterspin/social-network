import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// POST /api/referrals/respond - Accept or decline a referral
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
    const { referral_id, user_id, accept, message } = body;

    if (!referral_id || !user_id || typeof accept !== "boolean") {
      return NextResponse.json(
        { error: "Missing required fields (referral_id, user_id, accept)" },
        { status: 400 }
      );
    }

    // Call the stored function to handle the response
    const { data, error } = await admin.rpc("respond_to_referral", {
      p_referral_id: referral_id,
      p_user_id: user_id,
      p_accept: accept,
      p_message: message || null,
    });

    if (error) throw error;

    // data is an array of rows returned from the function
    const result = data?.[0] || data;

    return NextResponse.json(
      {
        status: result?.status,
        match_id: result?.match_id,
        message:
          result?.status === "connected"
            ? "Connection established! You can now chat."
            : result?.status === "declined"
              ? "Referral declined."
              : "Your response has been recorded. Waiting for the other party.",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[Referrals Respond API] Error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
