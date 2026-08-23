import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { profiles, socialLinks, users } from "@/lib/db/schema";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    if (!id) {
      return NextResponse.json(
        { error: { message: "Missing user id" } },
        { status: 400 }
      );
    }

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        username: profiles.username,
        preferred_name: profiles.preferredName,
        profile_image_url: profiles.profileImageUrl,
        bio: profiles.bio,
        gender: profiles.gender,
        created_at: profiles.createdAt,
        updated_at: profiles.updatedAt,
      })
      .from(users)
      .leftJoin(profiles, eq(users.id, profiles.id))
      .where(eq(users.id, id))
      .limit(1);
    if (!user) return NextResponse.json({ data: null }, { status: 404 });

    const links = await db
      .select({
        id: socialLinks.id,
        platform: socialLinks.platform,
        url: socialLinks.url,
      })
      .from(socialLinks)
      .where(eq(socialLinks.userId, id));

    return NextResponse.json({ data: { user, links } }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { error: { message: (e as Error).message } },
      { status: 500 }
    );
  }
}
