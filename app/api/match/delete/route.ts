import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { matches } from "@/lib/db/schema";

export async function POST(request: Request) {
  try {
    const { match_id, user_id } = await request.json();
    if (!match_id || !user_id) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

    const [match] = await db.select().from(matches).where(eq(matches.id, match_id)).limit(1);
    if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });
    if (match.user1Id !== user_id && match.user2Id !== user_id) return NextResponse.json({ error: "User is not a participant in this chat" }, { status: 403 });

    await db.delete(matches).where(eq(matches.id, match_id));
    return NextResponse.json({ message: "Chat deleted successfully" }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
