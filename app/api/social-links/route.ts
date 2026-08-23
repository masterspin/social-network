import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { socialLinks } from "@/lib/db/schema";

export async function GET(request: Request) {
  const userId = new URL(request.url).searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: { message: "Missing userId" } }, { status: 400 });
  }

  const rows = await db
    .select({
      id: socialLinks.id,
      user_id: socialLinks.userId,
      platform: socialLinks.platform,
      url: socialLinks.url,
      created_at: socialLinks.createdAt,
    })
    .from(socialLinks)
    .where(eq(socialLinks.userId, userId))
    .orderBy(asc(socialLinks.createdAt));

  return NextResponse.json({ data: rows }, { status: 200 });
}

export async function POST(request: Request) {
  const body = await request.json();
  const userId = body.user_id ?? body.userId;
  if (!userId || !body.platform || !body.url) {
    return NextResponse.json({ error: { message: "Missing social link fields" } }, { status: 400 });
  }

  const [row] = await db
    .insert(socialLinks)
    .values({ userId, platform: body.platform, url: body.url })
    .returning();

  return NextResponse.json({ data: row ?? null }, { status: 200 });
}

export async function DELETE(request: Request) {
  const linkId = new URL(request.url).searchParams.get("linkId");
  if (!linkId) {
    return NextResponse.json({ error: { message: "Missing linkId" } }, { status: 400 });
  }

  await db.delete(socialLinks).where(eq(socialLinks.id, linkId));
  return NextResponse.json({ data: { deleted: true } }, { status: 200 });
}
