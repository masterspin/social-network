import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { profiles, socialLinks, socialVerifications, users } from "@/lib/db/schema";
import { getProfilePatchUpdates } from "@/lib/profile";

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

    const verifications = await db
      .select({
        provider: socialVerifications.provider,
        provider_account_id: socialVerifications.providerAccountId,
        display_name: socialVerifications.displayName,
        profile_url: socialVerifications.profileUrl,
      })
      .from(socialVerifications)
      .where(eq(socialVerifications.userId, id));

    return NextResponse.json(
      { data: { user, links, verifications } },
      { status: 200 },
    );
  } catch (e) {
    return NextResponse.json(
      { error: { message: (e as Error).message } },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const sessionUserId = session?.user?.id;

  if (!sessionUserId) {
    return NextResponse.json(
      { error: { message: "Not authenticated" } },
      { status: 401 }
    );
  }

  if (!id || sessionUserId !== id) {
    return NextResponse.json(
      { error: { message: "Not authorized" } },
      { status: 403 }
    );
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const { userUpdates, profileUpdates } = getProfilePatchUpdates(body);

    if (Object.keys(userUpdates).length > 0) {
      await db.update(users).set(userUpdates).where(eq(users.id, id));
    }

    await db
      .insert(profiles)
      .values({ id, ...profileUpdates })
      .onConflictDoUpdate({
        target: profiles.id,
        set: profileUpdates,
      });

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
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

    return NextResponse.json({ data: user ?? null }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { error: { message: (e as Error).message } },
      { status: 500 }
    );
  }
}
