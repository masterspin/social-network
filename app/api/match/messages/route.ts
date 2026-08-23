import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { matchMessages, matches } from "@/lib/db/schema";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const matchId = searchParams.get("match_id");
  const messageId = searchParams.get("message_id");
  if (!matchId && !messageId) return NextResponse.json({ error: "Missing match_id or message_id parameter" }, { status: 400 });

  if (messageId) {
    const [row] = await db.select().from(matchMessages).where(eq(matchMessages.id, messageId)).limit(1);
    return NextResponse.json({ data: row ?? null }, { status: 200 });
  }

  const data = await db.select().from(matchMessages).where(eq(matchMessages.matchId, matchId!)).orderBy(matchMessages.createdAt);
  return NextResponse.json({ data }, { status: 200 });
}

export async function POST(request: Request) {
  try {
    const { match_id, sender_id, message } = await request.json();
    if (!match_id || !sender_id || !message) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

    const [match] = await db.select().from(matches).where(eq(matches.id, match_id)).limit(1);
    if (!match || (match.user1Id !== sender_id && match.user2Id !== sender_id)) {
      return NextResponse.json({ error: "Chat is not active or does not exist" }, { status: 403 });
    }

    const [data] = await db.insert(matchMessages).values({ matchId: match_id, senderId: sender_id, message }).returning();
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
