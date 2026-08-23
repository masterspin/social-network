import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { profiles, users } from "@/lib/db/schema";

export async function GET() {
  const data = await db
    .select({
      id: users.id,
      name: users.name,
      preferred_name: profiles.preferredName,
      profile_image_url: profiles.profileImageUrl,
    })
    .from(users)
    .leftJoin(profiles, eq(users.id, profiles.id))
    .orderBy(asc(users.name))
    .limit(200);
  return NextResponse.json({ data }, { status: 200 });
}
