import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

export async function POST(request: Request) {
  try {
    const { connectionId, requesterId } = (await request.json()) as {
      connectionId?: string;
      requesterId?: string;
    };

    if (!connectionId || !requesterId) {
      return NextResponse.json(
        { error: { message: "connectionId and requesterId are required" } },
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

    const { data: connection, error: fetchError } = await admin
      .from("connections")
      .select(
        `
        id,
        requester_id,
        recipient_id,
        status,
        connection_type,
        upgrade_requested_type,
        upgrade_requested_by
      `
      )
      .eq("id", connectionId)
      .maybeSingle();

    if (fetchError) {
      return NextResponse.json({ error: fetchError }, { status: 400 });
    }

    if (!connection) {
      return NextResponse.json(
        { error: { message: "Connection not found" } },
        { status: 404 }
      );
    }

    const isParticipant =
      connection.requester_id === requesterId ||
      connection.recipient_id === requesterId;

    if (!isParticipant) {
      return NextResponse.json(
        { error: { message: "You are not part of this connection" } },
        { status: 403 }
      );
    }

    if (connection.status !== "accepted") {
      return NextResponse.json(
        { error: { message: "Only accepted connections can be upgraded" } },
        { status: 400 }
      );
    }

    if (connection.connection_type !== "one_point_five") {
      return NextResponse.json(
        {
          error: {
            message: "Upgrade requests are only allowed for 1.5 connections",
          },
        },
        { status: 409 }
      );
    }

    if (connection.upgrade_requested_type) {
      return NextResponse.json(
        {
          error: {
            message:
              "An upgrade request is already pending for this connection",
          },
        },
        { status: 409 }
      );
    }

    const { count: firstCount, error: countError } = await admin
      .from("connections")
      .select("*", { count: "exact", head: true })
      .eq("status", "accepted")
      .eq("connection_type", "first")
      .or(`requester_id.eq.${requesterId},recipient_id.eq.${requesterId}`);

    if (countError) {
      return NextResponse.json({ error: countError }, { status: 400 });
    }

    if ((firstCount ?? 0) >= 100) {
      return NextResponse.json(
        {
          error: {
            message:
              "You have reached the limit of 100 first connections. Downgrade one before requesting an upgrade.",
          },
        },
        { status: 403 }
      );
    }

    const { data: updated, error: updateError } = await admin
      .from("connections")
      .update({
        connection_type: "one_point_five",
        upgrade_requested_type: "first",
        upgrade_requested_by: requesterId,
      })
      .eq("id", connectionId)
      .eq("status", "accepted")
      .eq("connection_type", "one_point_five")
      .is("upgrade_requested_type", null)
      .select(
        `
        id,
        requester_id,
        recipient_id,
        status,
        connection_type,
        upgrade_requested_type,
        upgrade_requested_by,
        updated_at
      `
      )
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError }, { status: 400 });
    }

    return NextResponse.json({ data: updated }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: { message: (error as Error).message } },
      { status: 500 }
    );
  }
}
