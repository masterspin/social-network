import { and, eq, ilike, notInArray, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { blockedUsers, profiles, users } from "@/lib/db/schema";

function sanitizeForOr(value: string, maxLen = 128) {
  const cleaned = value.replace(/[(),]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, maxLen);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = sanitizeForOr(searchParams.get("q") ?? "");
  const requesterId = searchParams.get("requesterId") ?? undefined;

  const blocked = requesterId
    ? await db
        .select({ id: blockedUsers.blockedId })
        .from(blockedUsers)
        .where(eq(blockedUsers.blockerId, requesterId))
    : [];
  const blockedMe = requesterId
    ? await db
        .select({ id: blockedUsers.blockerId })
        .from(blockedUsers)
        .where(eq(blockedUsers.blockedId, requesterId))
    : [];

  const blockedIds = new Set([
    ...blocked.map((r) => r.id),
    ...blockedMe.map((r) => r.id),
  ]);

  const filters = [];
  if (q) {
    filters.push(
      or(
        ilike(users.name, `%${q}%`),
        ilike(profiles.preferredName, `%${q}%`),
      ),
    );
  }
  if (requesterId) {
    filters.push(notInArray(users.id, [requesterId]));
  }

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      preferred_name: profiles.preferredName,
      profile_image_url: profiles.profileImageUrl,
    })
    .from(users)
    .leftJoin(profiles, eq(users.id, profiles.id))
    .where(filters.length > 0 ? and(...filters) : undefined);

  return NextResponse.json(
    { data: rows.filter((u) => !blockedIds.has(u.id)).slice(0, 20) },
    { status: 200 }
  );
}
