import { and, eq, inArray, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  itineraryComments,
  itineraryOwnerInvitations,
  itinerarySegments,
  itineraryTasks,
  itineraryTravelers,
  itineraries,
  profiles,
  users,
} from "@/lib/db/schema";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function resolveUserId(request: Request): Promise<string | null> {
  const { searchParams } = new URL(request.url);
  return (
    searchParams.get("user_id") ??
    request.headers.get("x-user-id") ??
    request.headers.get("X-User-Id") ??
    request.headers.get("X-USER-ID")
  );
}

async function getMembership(itineraryId: string, userId: string) {
  const [itinerary] = await db
    .select({ ownerId: itineraries.ownerId })
    .from(itineraries)
    .where(eq(itineraries.id, itineraryId))
    .limit(1);
  if (!itinerary) return { isOwner: false, isMember: false };
  if (itinerary.ownerId === userId) return { isOwner: true, isMember: true };
  const [membership] = await db
    .select({ id: itineraryTravelers.id })
    .from(itineraryTravelers)
    .where(and(eq(itineraryTravelers.itineraryId, itineraryId), eq(itineraryTravelers.userId, userId)))
    .limit(1);
  return { isOwner: false, isMember: Boolean(membership) };
}

export async function GET(request: Request, context: RouteContext) {
  const { id: itineraryId } = await context.params;
  const userId = await resolveUserId(request);
  if (!itineraryId || !userId) return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });

  const membership = await getMembership(itineraryId, userId);
  if (!membership.isMember) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const [itinerary] = await db
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
    .where(eq(itineraries.id, itineraryId))
    .limit(1);
  if (!itinerary) return NextResponse.json({ error: "Itinerary not found" }, { status: 404 });

  const travelers = await db.select().from(itineraryTravelers).where(eq(itineraryTravelers.itineraryId, itineraryId));
  const segments = await db.select().from(itinerarySegments).where(eq(itinerarySegments.itineraryId, itineraryId));
  const comments = await db.select().from(itineraryComments).where(eq(itineraryComments.itineraryId, itineraryId));
  const invitations = await db.select().from(itineraryOwnerInvitations).where(eq(itineraryOwnerInvitations.itineraryId, itineraryId));
  const tasks = await db.select().from(itineraryTasks).where(inArray(itineraryTasks.segmentId, segments.map((s) => s.id)));
  const owner = await db
    .select({
      id: users.id,
      username: profiles.username,
      name: users.name,
      preferred_name: profiles.preferredName,
      profile_image_url: profiles.profileImageUrl,
    })
    .from(users)
    .leftJoin(profiles, eq(users.id, profiles.id))
    .where(eq(users.id, itinerary.owner_id))
    .limit(1);

  return NextResponse.json(
    { data: { ...itinerary, owner: owner[0] ?? null, travelers, segments, comments, invitations, tasks } },
    { status: 200 }
  );
}

export async function PUT(request: Request, context: RouteContext) {
  const { id: itineraryId } = await context.params;
  const body = await request.json();
  const ownerId = body?.owner_id as string | undefined;
  if (!itineraryId || !ownerId) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

  const membership = await getMembership(itineraryId, ownerId);
  if (!membership.isOwner) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  await db.update(itineraries).set({
    title: typeof body.title === "string" ? body.title : undefined,
    description: typeof body.description === "string" ? body.description : undefined,
    summary: typeof body.summary === "string" ? body.summary : undefined,
    startDate: body.start_date ?? undefined,
    endDate: body.end_date ?? undefined,
    timezone: typeof body.timezone === "string" ? body.timezone : undefined,
    visibility: typeof body.visibility === "string" ? body.visibility : undefined,
    visibilityDetail: typeof body.visibility_detail === "string" ? body.visibility_detail : undefined,
    status: typeof body.status === "string" ? body.status : undefined,
    coverImageUrl: typeof body.cover_image_url === "string" ? body.cover_image_url : undefined,
  }).where(eq(itineraries.id, itineraryId));
  return NextResponse.json({ message: "Itinerary updated" }, { status: 200 });
}

export async function DELETE(request: Request, context: RouteContext) {
  const { id: itineraryId } = await context.params;
  const { searchParams } = new URL(request.url);
  const requesterId = searchParams.get("user_id");
  if (!itineraryId || !requesterId) return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });

  const membership = await getMembership(itineraryId, requesterId);
  if (!membership.isOwner) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  await db.delete(itineraries).where(eq(itineraries.id, itineraryId));
  return NextResponse.json({ message: "Itinerary deleted" }, { status: 200 });
}
