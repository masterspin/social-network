import { and, eq, inArray, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  itineraryTravelers,
  itineraries,
  users,
} from "@/lib/db/schema";

type TravelerInput = {
  user_id?: unknown;
  email?: unknown;
  role?: unknown;
  invitation_status?: unknown;
  notifications_enabled?: unknown;
  color_hex?: unknown;
};

async function resolveUserId(request: Request): Promise<string | null> {
  const { searchParams } = new URL(request.url);
  const headerCandidates = [
    searchParams.get("user_id"),
    request.headers.get("x-user-id"),
    request.headers.get("X-User-Id"),
    request.headers.get("X-USER-ID"),
  ].filter((value): value is string => Boolean(value && value !== "undefined" && value !== "null"));
  if (headerCandidates.length > 0) return headerCandidates[0];
  return null;
}

export async function GET(request: Request) {
  if (process.env.NEXT_PUBLIC_DEV_MODE === "true") {
    const { MOCK_ITINERARIES } = await import("@/lib/dev/mock-data");
    return NextResponse.json({ data: MOCK_ITINERARIES }, { status: 200 });
  }

  const userId = await resolveUserId(request);
  if (!userId) return NextResponse.json({ error: "Missing user_id parameter" }, { status: 400 });

  const owned = await db
    .select({
      id: itineraries.id,
      owner_id: itineraries.ownerId,
      title: itineraries.title,
      description: itineraries.description,
      summary: itineraries.summary,
      start_date: itineraries.startDate,
      end_date: itineraries.endDate,
      timezone: itineraries.timezone,
      visibility: itineraries.visibility,
      visibility_detail: itineraries.visibilityDetail,
      status: itineraries.status,
      cover_image_url: itineraries.coverImageUrl,
      created_at: itineraries.createdAt,
      updated_at: itineraries.updatedAt,
    })
    .from(itineraries)
    .where(eq(itineraries.ownerId, userId));

  const memberRows = await db
    .select({ itinerary_id: itineraryTravelers.itineraryId })
    .from(itineraryTravelers)
    .where(eq(itineraryTravelers.userId, userId));
  const memberIds = memberRows.map((r) => r.itinerary_id).filter((id) => !owned.some((i) => i.id === id));
  const shared = memberIds.length
    ? await db
        .select({
          id: itineraries.id,
          owner_id: itineraries.ownerId,
          title: itineraries.title,
          description: itineraries.description,
          summary: itineraries.summary,
          start_date: itineraries.startDate,
          end_date: itineraries.endDate,
          timezone: itineraries.timezone,
          visibility: itineraries.visibility,
          visibility_detail: itineraries.visibilityDetail,
          status: itineraries.status,
          cover_image_url: itineraries.coverImageUrl,
          created_at: itineraries.createdAt,
          updated_at: itineraries.updatedAt,
        })
        .from(itineraries)
        .where(inArray(itineraries.id, memberIds))
    : [];

  const combined = [...owned, ...shared].filter((item, idx, arr) => arr.findIndex((x) => x.id === item.id) === idx);
  combined.sort((a, b) => (a.start_date ? new Date(a.start_date).getTime() : Number.MAX_SAFE_INTEGER) - (b.start_date ? new Date(b.start_date).getTime() : Number.MAX_SAFE_INTEGER));
  return NextResponse.json({ data: combined }, { status: 200 });
}

export async function POST(request: Request) {
  const payload = await request.json();
  const {
    owner_id: ownerId,
    title,
    description,
    summary,
    start_date: startDate,
    end_date: endDate,
    timezone,
    visibility,
    visibility_detail: visibilityDetail,
    status,
    cover_image_url: coverImageUrl,
  } = payload ?? {};

  if (!ownerId || !title) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

  const [inserted] = await db
    .insert(itineraries)
    .values({
      ownerId,
      title,
      description,
      summary,
      startDate: startDate ?? null,
      endDate: endDate ?? null,
      timezone: timezone ?? null,
      visibility: visibility ?? "private",
      visibilityDetail: visibilityDetail ?? "private",
      status: status ?? "planning",
      coverImageUrl: coverImageUrl ?? null,
    })
    .returning();

  const travelers = Array.isArray(payload.travelers) ? payload.travelers : [];
  await db.insert(itineraryTravelers).values([
    { itineraryId: inserted.id, userId: ownerId, createdAt: new Date() },
    ...travelers
      .map((traveler: TravelerInput) => (typeof traveler.user_id === "string" ? traveler.user_id : null))
      .filter(Boolean)
      .map((userId: string) => ({ itineraryId: inserted.id, userId })),
  ] as never);

  return NextResponse.json({ data: inserted }, { status: 201 });
}
