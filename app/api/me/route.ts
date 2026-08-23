import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { profiles, users } from "@/lib/db/schema";

export async function GET() {
  let user = null;

  try {
    const session = await auth();
    user = session?.user ?? null;
  } catch (error) {
    console.error("[api/me] Failed to read session", error);
    return NextResponse.json({ user: null, profile: null }, { status: 200 });
  }

  if (!user?.id) {
    return NextResponse.json({ user: null, profile: null }, { status: 200 });
  }

  const [profile] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      preferred_name: profiles.preferredName,
      profile_image_url: profiles.profileImageUrl,
      bio: profiles.bio,
      created_at: profiles.createdAt,
      updated_at: profiles.updatedAt,
    })
    .from(users)
    .leftJoin(profiles, eq(users.id, profiles.id))
    .where(eq(users.id, user.id))
    .limit(1);

  return NextResponse.json({ user, profile: profile ?? null }, { status: 200 });
}
