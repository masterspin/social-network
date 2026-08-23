import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { itineraryComments, itineraryTravelers, itineraries } from "@/lib/db/schema";

type RouteContext = { params: Promise<{ id: string }> };

async function resolveUserId(request: Request): Promise<string | null> {
  const { searchParams } = new URL(request.url);
  return searchParams.get("user_id") ?? request.headers.get("x-user-id") ?? request.headers.get("X-User-Id") ?? request.headers.get("X-USER-ID");
}

async function canAccess(itineraryId: string, userId: string) {
  const [itinerary] = await db.select({ ownerId: itineraries.ownerId }).from(itineraries).where(eq(itineraries.id, itineraryId)).limit(1);
  if (!itinerary) return false;
  if (itinerary.ownerId === userId) return true;
  const [traveler] = await db.select({ id: itineraryTravelers.id }).from(itineraryTravelers).where(and(eq(itineraryTravelers.itineraryId, itineraryId), eq(itineraryTravelers.userId, userId))).limit(1);
  return Boolean(traveler);
}

export async function GET(request: Request, context: RouteContext) {
  const { id: itineraryId } = await context.params;
  const userId = await resolveUserId(request);
  const { searchParams } = new URL(request.url);
  const segmentId = searchParams.get("segment_id");
  if (!itineraryId || !userId) return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
  if (!(await canAccess(itineraryId, userId))) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  let data = await db.select().from(itineraryComments).where(eq(itineraryComments.itineraryId, itineraryId)).orderBy(asc(itineraryComments.createdAt));
  if (segmentId) data = data.filter((row) => (row as { segmentId?: string | null }).segmentId === segmentId);
  return NextResponse.json({ data }, { status: 200 });
}

export async function POST(request: Request, context: RouteContext) {
  const { id: itineraryId } = await context.params;
  const body = await request.json();
  const userId = body?.user_id as string | undefined;
  if (!itineraryId || !userId || typeof body.body !== "string") return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  if (!(await canAccess(itineraryId, userId))) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const [data] = await db.insert(itineraryComments).values({
    itineraryId,
    authorId: userId,
    body: body.body.trim(),
  }).returning();
  return NextResponse.json({ data }, { status: 201 });
}
