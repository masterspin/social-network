import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { connectionNotes } from "@/lib/db/schema";

function mapNote(row: typeof connectionNotes.$inferSelect) {
  return {
    id: row.id,
    connection_id: row.connectionId,
    user_id: row.userId,
    description: row.description,
    year: row.year,
    connection_type: row.connectionType ?? "one_point_five",
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const connectionId = searchParams.get("connectionId");
  const userId = searchParams.get("userId");

  if (!connectionId || !userId) {
    return NextResponse.json(
      { error: { message: "Missing connectionId or userId" } },
      { status: 400 },
    );
  }

  const [row] = await db
    .select()
    .from(connectionNotes)
    .where(
      and(
        eq(connectionNotes.connectionId, connectionId),
        eq(connectionNotes.userId, userId),
      ),
    )
    .limit(1);

  return NextResponse.json({ data: row ? mapNote(row) : null }, { status: 200 });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    connectionId?: string;
    connection_id?: string;
    userId?: string;
    user_id?: string;
    description?: string | null;
    year?: string | null;
    connection_type?: "first" | "one_point_five" | null;
  };
  const connectionId = body.connectionId ?? body.connection_id;
  const userId = body.userId ?? body.user_id;

  if (!connectionId || !userId) {
    return NextResponse.json(
      { error: { message: "Missing connectionId or userId" } },
      { status: 400 },
    );
  }

  const note = {
    connectionId,
    userId,
    description: body.description?.trim() || null,
    year: body.year?.trim() || null,
    connectionType: body.connection_type ?? "one_point_five",
    updatedAt: new Date(),
  };

  const [row] = await db
    .insert(connectionNotes)
    .values(note)
    .onConflictDoUpdate({
      target: [connectionNotes.connectionId, connectionNotes.userId],
      set: {
        description: note.description,
        year: note.year,
        connectionType: note.connectionType,
        updatedAt: note.updatedAt,
      },
    })
    .returning();

  return NextResponse.json({ data: row ? mapNote(row) : null }, { status: 200 });
}
