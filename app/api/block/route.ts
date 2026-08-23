import { and, eq, inArray, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mapBlockedUsers } from "@/lib/blocked-users";
import { blockedUsers, connections, profiles, users } from "@/lib/db/schema";

export async function GET(request: Request) {
  const blockerId = new URL(request.url).searchParams.get("blockerId");
  if (!blockerId) {
    return NextResponse.json({ error: { message: "Missing blockerId" } }, { status: 400 });
  }

  const rows = await db
    .select({
      id: blockedUsers.id,
      blocker_id: blockedUsers.blockerId,
      blocked_id: blockedUsers.blockedId,
      created_at: blockedUsers.createdAt,
    })
    .from(blockedUsers)
    .where(eq(blockedUsers.blockerId, blockerId));

  const blockedIds = rows.map((row) => row.blocked_id);
  const userRows = blockedIds.length
    ? await db
        .select({
          id: users.id,
          name: users.name,
          preferred_name: profiles.preferredName,
          profile_image_url: profiles.profileImageUrl,
        })
        .from(users)
        .leftJoin(profiles, eq(users.id, profiles.id))
        .where(inArray(users.id, blockedIds))
    : [];

  return NextResponse.json(
    { data: mapBlockedUsers({ rows, users: userRows }) },
    { status: 200 },
  );
}

export async function POST(request: Request) {
  const { blockerId, blockedId, action } = await request.json();
  if (!blockerId || !blockedId) {
    return NextResponse.json(
      { error: { message: "Missing blockerId or blockedId" } },
      { status: 400 }
    );
  }

  try {
    if (action === "unblock") {
      await db.delete(blockedUsers).where(and(eq(blockedUsers.blockerId, blockerId), eq(blockedUsers.blockedId, blockedId)));
      return NextResponse.json({ data: { unblocked: true } }, { status: 200 });
    }

    await db.insert(blockedUsers).values({ blockerId, blockedId }).onConflictDoNothing();
    await db.delete(connections).where(or(and(eq(connections.requesterId, blockerId), eq(connections.recipientId, blockedId)), and(eq(connections.requesterId, blockedId), eq(connections.recipientId, blockerId))));

    return NextResponse.json({ data: { blocked: true } }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { error: { message: (e as Error).message } },
      { status: 500 }
    );
  }
}
