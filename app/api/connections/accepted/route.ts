import { NextResponse } from "next/server";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { connections, profiles, users } from "@/lib/db/schema";

// Returns the list of a user's accepted, direct connections with mutual counts.
// Response shape:
// {
//   data: Array<{
//     id: string;               // connection row id
//     how_met: string;          // description
//     other_user: {             // the person you're connected to
//       id: string;
//       name: string;
//       preferred_name: string | null;
//       profile_image_url: string | null;
//     };
//     mutualCount: number;      // number of mutual direct connections
//   }>
// }
export async function GET(request: Request) {
  if (process.env.NEXT_PUBLIC_DEV_MODE === "true") {
    const { MOCK_ACCEPTED_CONNECTIONS } = await import("@/lib/dev/mock-data");
    return NextResponse.json({ data: MOCK_ACCEPTED_CONNECTIONS }, { status: 200 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) {
    return NextResponse.json(
      { error: { message: "Missing userId" } },
      { status: 400 }
    );
  }

  try {
    const myConns = await db
      .select()
      .from(connections)
      .where(or(eq(connections.requesterId, userId), eq(connections.recipientId, userId)))
      .orderBy(asc(connections.createdAt));
    const accepted = myConns.filter((row) => row.status === "accepted");
    const neighborIds = Array.from(
      new Set(
        accepted.map((row) => (row.requesterId === userId ? row.recipientId : row.requesterId)),
      ),
    );
    const allAccepted = neighborIds.length
      ? await db
          .select({ requesterId: connections.requesterId, recipientId: connections.recipientId })
          .from(connections)
          .where(and(eq(connections.status, "accepted"), or(inArray(connections.requesterId, neighborIds), inArray(connections.recipientId, neighborIds))))
      : [];
    const adjacency = new Map<string, Set<string>>();
    const addEdge = (a: string, b: string) => {
      if (!adjacency.has(a)) adjacency.set(a, new Set());
      if (!adjacency.has(b)) adjacency.set(b, new Set());
      adjacency.get(a)!.add(b);
      adjacency.get(b)!.add(a);
    };
    [...accepted, ...allAccepted].forEach((row) => addEdge(row.requesterId, row.recipientId));
    const mySet = adjacency.get(userId) ?? new Set<string>();
    const userRows = await db
      .select({ id: users.id, name: users.name, preferred_name: profiles.preferredName, profile_image_url: profiles.profileImageUrl })
      .from(users)
      .leftJoin(profiles, eq(users.id, profiles.id))
      .where(inArray(users.id, neighborIds))
      .orderBy(asc(users.name));
    const userById = new Map(userRows.map((u) => [u.id, u]));
    const result = accepted.map((c) => {
      const otherId = c.requesterId === userId ? c.recipientId : c.requesterId;
      const other = userById.get(otherId) || null;
      let mutual = 0;
      adjacency.get(otherId)?.forEach((x) => {
        if (x !== userId && x !== otherId && mySet.has(x)) mutual += 1;
      });
      return { id: c.id, how_met: c.howMet, status: c.status, connection_type: c.connectionType, other_user: other, mutualCount: mutual };
    });

    return NextResponse.json({ data: result }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { error: { message: (e as Error).message } },
      { status: 500 }
    );
  }
}
