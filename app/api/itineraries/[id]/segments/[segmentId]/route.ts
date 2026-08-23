import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { itinerarySegments, itineraryTravelers, itineraries } from "@/lib/db/schema";

type RouteContext = { params: Promise<{ id: string; segmentId: string }> };

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

export async function PATCH(request: Request, context: RouteContext) {
  const { id: itineraryId, segmentId } = await context.params;
  const body = await request.json();
  const userId = body?.user_id as string | undefined;
  if (!itineraryId || !segmentId || !userId) return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
  const [itinerary] = await db.select({ ownerId: itineraries.ownerId }).from(itineraries).where(eq(itineraries.id, itineraryId)).limit(1);
  if (!itinerary || itinerary.ownerId !== userId) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const [data] = await db.update(itinerarySegments).set({
    title: typeof body.title === "string" ? body.title : undefined,
    type: typeof body.type === "string" ? body.type : undefined,
    orderIndex: typeof body.orderIndex === "number" ? body.orderIndex : undefined,
    data: body.data && typeof body.data === "object" ? body.data : undefined,
  }).where(and(eq(itinerarySegments.id, segmentId), eq(itinerarySegments.itineraryId, itineraryId))).returning();
  return NextResponse.json({ data }, { status: 200 });
}

export async function DELETE(request: Request, context: RouteContext) {
  const { id: itineraryId, segmentId } = await context.params;
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("user_id");
  if (!itineraryId || !segmentId || !userId) return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
  const [itinerary] = await db.select({ ownerId: itineraries.ownerId }).from(itineraries).where(eq(itineraries.id, itineraryId)).limit(1);
  if (!itinerary || itinerary.ownerId !== userId) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  await db.delete(itinerarySegments).where(and(eq(itinerarySegments.id, segmentId), eq(itinerarySegments.itineraryId, itineraryId)));
  return NextResponse.json({ message: "Segment deleted" }, { status: 200 });
}
