import { and, eq, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { connections, matches, profiles, users } from "@/lib/db/schema";

export async function POST(request: Request) {
  try {
    const { matchmaker_id, user1_id, user2_id } = await request.json();
    if (!matchmaker_id || !user1_id || !user2_id) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const conns = await db
      .select()
      .from(connections)
      .where(
        and(
          eq(connections.status, "accepted"),
          or(
            and(eq(connections.requesterId, matchmaker_id), or(eq(connections.recipientId, user1_id), eq(connections.recipientId, user2_id))),
            and(eq(connections.recipientId, matchmaker_id), or(eq(connections.requesterId, user1_id), eq(connections.requesterId, user2_id))),
          ),
        ),
      );

    const valid1 = conns.some((c) => c.connectionType === "first" && ((c.requesterId === matchmaker_id && c.recipientId === user1_id) || (c.recipientId === matchmaker_id && c.requesterId === user1_id)));
    const valid2 = conns.some((c) => c.connectionType === "first" && ((c.requesterId === matchmaker_id && c.recipientId === user2_id) || (c.recipientId === matchmaker_id && c.requesterId === user2_id)));
    if (!valid1 || !valid2) return NextResponse.json({ error: "Both users must be first connections of the matchmaker" }, { status: 400 });

    const [lowerUserId, higherUserId] = user1_id < user2_id ? [user1_id, user2_id] : [user2_id, user1_id];
    const [existing] = await db.select().from(matches).where(and(eq(matches.user1Id, lowerUserId), eq(matches.user2Id, higherUserId))).limit(1);
    if (existing) return NextResponse.json({ match_id: existing.id, message: "Match created successfully!" }, { status: 200 });

    const [row] = await db.insert(matches).values({ matchmakerId: matchmaker_id, user1Id: lowerUserId, user2Id: higherUserId }).returning();
    return NextResponse.json({ match_id: row.id, message: "Match created successfully!" }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  if (process.env.NEXT_PUBLIC_DEV_MODE === "true") {
    const { MOCK_MATCHES } = await import("@/lib/dev/mock-data");
    return NextResponse.json({ data: MOCK_MATCHES }, { status: 200 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("user_id");
  if (!userId) return NextResponse.json({ error: "Missing user_id parameter" }, { status: 400 });

  const rows = await db
    .select()
    .from(matches)
    .where(or(eq(matches.user1Id, userId), eq(matches.user2Id, userId)));
  const people = await db.select({ id: users.id, name: users.name, preferred_name: profiles.preferredName, profile_image_url: profiles.profileImageUrl }).from(users).leftJoin(profiles, eq(users.id, profiles.id));
  const byId = new Map(people.map((u) => [u.id, u]));

  return NextResponse.json(
    {
      data: rows.map((match) => ({
        id: match.id,
        matchmaker: byId.get(match.matchmakerId ?? "") ?? null,
        other_user: match.user1Id === userId ? byId.get(match.user2Id ?? "") ?? null : byId.get(match.user1Id ?? "") ?? null,
        is_active: true,
        deleted_at: null,
        created_at: match.createdAt,
      })),
    },
    { status: 200 }
  );
}
