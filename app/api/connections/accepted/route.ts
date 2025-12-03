import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

// Returns the list of a user's accepted, direct connections with mutual counts.
// Response shape:
// {
//   data: Array<{
//     id: string;               // connection row id
//     how_met: string;          // description
//     other_user: {             // the person you're connected to
//       id: string;
//       username: string;
//       name: string;
//       preferred_name: string | null;
//       profile_image_url: string | null;
//     };
//     mutualCount: number;      // number of mutual direct connections
//   }>
// }
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
    type UserLite = {
      id: string;
      username: string;
      name: string;
      preferred_name: string | null;
      profile_image_url: string | null;
    };
    type ConnRow = {
      id: string;
      how_met: string;
      requester: UserLite;
      recipient: UserLite;
      requester_id?: string;
      recipient_id?: string;
      status?: string | null;
    };
    const baseSelect = `
      *,
      requester:users!connections_requester_id_fkey(id, username, name, preferred_name, profile_image_url),
      recipient:users!connections_recipient_id_fkey(id, username, name, preferred_name, profile_image_url)
    `;

    // Step 1: fetch direct accepted connections for the user
    const { data: myConns, error: e1 } = await admin
      .from("connections")
      .select(baseSelect)
      .or(`requester_id.eq.${userId},recipient_id.eq.${userId}`)
      .eq("status", "accepted");
    if (e1) return NextResponse.json({ error: e1 }, { status: 400 });

    const neighborIds = Array.from(
      new Set(
        ((myConns as ConnRow[]) || []).map((c) =>
          c.requester?.id === userId ? c.recipient?.id : c.requester?.id
        )
      )
    ).filter(Boolean) as string[];

    // If no neighbors, return quickly
    if (neighborIds.length === 0) {
      return NextResponse.json({ data: [] }, { status: 200 });
    }

    // Step 2: fetch accepted connections for all neighbors (to compute mutuals)
    const { data: neighborConns, error: e2 } = await admin
      .from("connections")
      .select("requester_id, recipient_id, status")
      .or(
        `requester_id.in.(${neighborIds.join(
          ","
        )}),recipient_id.in.(${neighborIds.join(",")})`
      )
      .eq("status", "accepted");
    if (e2) return NextResponse.json({ error: e2 }, { status: 400 });

    // Also include my own accepted edges to build adjacency for me
    const allForAdjacency = [
      ...(neighborConns || []),
      ...((myConns as unknown[]) || []),
    ] as {
      requester_id: string;
      recipient_id: string;
      status?: string | null;
    }[];

    // Build adjacency map of user -> set of direct neighbors
    const adj = new Map<string, Set<string>>();
    const addEdge = (a: string, b: string) => {
      if (!adj.has(a)) adj.set(a, new Set());
      adj.get(a)!.add(b);
      if (!adj.has(b)) adj.set(b, new Set());
      adj.get(b)!.add(a);
    };
    allForAdjacency.forEach((row) =>
      addEdge(row.requester_id, row.recipient_id)
    );

    const mySet = adj.get(userId) || new Set<string>();

    // Shape the response with mutual counts
    const result = ((myConns as ConnRow[]) || []).map((c) => {
      const other = c.requester?.id === userId ? c.recipient : c.requester;
      const otherId: string | undefined = other?.id;
      let mutual = 0;
      if (otherId) {
        const otherSet = adj.get(otherId) || new Set<string>();
        // Intersection excluding me and the other person
        otherSet.forEach((x) => {
          if (x !== userId && x !== otherId && mySet.has(x)) mutual += 1;
        });
      }
      return {
        id: c.id as string,
        how_met: c.how_met as string,
        connection_type:
          (c as unknown as { connection_type?: string }).connection_type ||
          "first",
        other_user: other || null,
        mutualCount: mutual,
      };
    });

    return NextResponse.json({ data: result }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { error: { message: (e as Error).message } },
      { status: 500 }
    );
  }
}
