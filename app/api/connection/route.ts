import { and, eq, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { connections, profiles, users } from "@/lib/db/schema";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const a = searchParams.get("a");
  const b = searchParams.get("b");

  if (!a || !b) {
    return NextResponse.json(
      { error: { message: "Missing user pair (a, b)" } },
      { status: 400 }
    );
  }

  try {
    const [row] = await db
      .select()
      .from(connections)
      .where(or(and(eq(connections.requesterId, a), eq(connections.recipientId, b)), and(eq(connections.requesterId, b), eq(connections.recipientId, a))))
      .orderBy(connections.createdAt)
      .limit(1);

    if (!row) return NextResponse.json({ data: null }, { status: 200 });

    const userSelection = {
      id: users.id,
      username: profiles.username,
      name: users.name,
      preferred_name: profiles.preferredName,
      profile_image_url: profiles.profileImageUrl,
    };
    const [requester] = await db.select(userSelection).from(users).leftJoin(profiles, eq(users.id, profiles.id)).where(eq(users.id, row.requesterId)).limit(1);
    const [recipient] = await db.select(userSelection).from(users).leftJoin(profiles, eq(users.id, profiles.id)).where(eq(users.id, row.recipientId)).limit(1);

    return NextResponse.json({ data: { ...row, requester, recipient } }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { error: { message: (e as Error).message } },
      { status: 500 }
    );
  }
}
