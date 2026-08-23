import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { connections, profiles, users } from "@/lib/db/schema";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: { message: "Missing userId" } }, { status: 400 });
  }

  const rows = await db
    .select()
    .from(connections)
    .where(and(eq(connections.recipientId, userId), eq(connections.status, "pending")))
    .orderBy(desc(connections.createdAt));

  const userRows = await db
    .select({ id: users.id, name: users.name, preferred_name: profiles.preferredName, profile_image_url: profiles.profileImageUrl })
    .from(users)
    .leftJoin(profiles, eq(users.id, profiles.id));
  const byId = new Map(userRows.map((u) => [u.id, u]));

  return NextResponse.json(
    {
      data: rows.map((row) => ({
        id: row.id,
        how_met: "",
        status: row.status,
        requester: byId.get(row.requesterId) ?? null,
        recipient: byId.get(row.recipientId) ?? null,
      })),
    },
    { status: 200 }
  );
}
