import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { accounts, socialVerifications } from "@/lib/db/schema";

const unlinkableProviders = new Set(["linkedin", "discord"]);

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

export async function DELETE(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json(
      { error: { message: "Not authenticated" } },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    provider?: string;
  };
  const provider = body.provider;

  if (!provider || !unlinkableProviders.has(provider)) {
    return NextResponse.json(
      { error: { message: "Invalid provider" } },
      { status: 400 },
    );
  }

  await db
    .delete(socialVerifications)
    .where(
      and(
        eq(socialVerifications.userId, userId),
        eq(socialVerifications.provider, provider),
      ),
    );

  await db
    .delete(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.provider, provider)));

  return NextResponse.json({ data: { provider } }, { status: 200 });
}
