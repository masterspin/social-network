import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { socialVerifications } from "@/lib/db/schema";

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json(
      { error: { message: "Not authenticated" } },
      { status: 401 },
    );
  }

  const rows = await db
    .select({
      provider: socialVerifications.provider,
      provider_account_id: socialVerifications.providerAccountId,
      display_name: socialVerifications.displayName,
      avatar_url: socialVerifications.avatarUrl,
      profile_url: socialVerifications.profileUrl,
      email: socialVerifications.email,
      verified_at: socialVerifications.verifiedAt,
    })
    .from(socialVerifications)
    .where(eq(socialVerifications.userId, userId));

  return NextResponse.json({ data: rows }, { status: 200 });
}
