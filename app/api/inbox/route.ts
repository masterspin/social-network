import { eq, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { connections, profiles, users } from "@/lib/db/schema";
import { toClientConnectionRow } from "@/lib/connection-shape";

export async function GET(request: Request) {
  if (process.env.NEXT_PUBLIC_DEV_MODE === "true") {
    return NextResponse.json(
      { data: { received: [], sent: [], upgradeRequests: [] } },
      { status: 200 }
    );
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: { message: "Missing userId" } }, { status: 400 });
  }

  const rows = await db
    .select()
    .from(connections)
    .where(or(eq(connections.recipientId, userId), eq(connections.requesterId, userId)));
  const usersRows = await db
    .select({
      id: users.id,
      name: users.name,
      preferred_name: profiles.preferredName,
      profile_image_url: profiles.profileImageUrl,
    })
    .from(users)
    .leftJoin(profiles, eq(users.id, profiles.id));
  const byId = new Map(usersRows.map((u) => [u.id, u]));
  const enrich = (row: typeof rows[number]) => ({
    ...toClientConnectionRow(row),
    requester: byId.get(row.requesterId) ?? null,
    recipient: byId.get(row.recipientId) ?? null,
  });
  return NextResponse.json(
    {
      data: {
        received: rows.filter((r) => r.recipientId === userId && r.status === "pending").map(enrich),
        sent: rows.filter((r) => r.requesterId === userId && r.status === "pending").map(enrich),
        upgradeRequests: rows.filter((r) => r.status === "accepted" && r.connectionType !== "first").map(enrich),
      },
    },
    { status: 200 }
  );
}
