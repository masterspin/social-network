import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { itineraryTasks, itineraryTravelers, itineraries } from "@/lib/db/schema";

type RouteContext = { params: Promise<{ id: string; segmentId: string; itemId: string }> };

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
  const { id: itineraryId, segmentId, itemId } = await context.params;
  const body = await request.json();
  const userId = body?.user_id as string | undefined;
  if (!itineraryId || !segmentId || !itemId || !userId) return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
  if (!(await canAccess(itineraryId, userId))) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const [existing] = await db.select().from(itineraryTasks).where(eq(itineraryTasks.id, itemId)).limit(1);
  if (!existing || existing.segmentId !== segmentId) return NextResponse.json({ error: "Item not found" }, { status: 404 });
  const [data] = await db.update(itineraryTasks).set({ completed: !existing.completed }).where(eq(itineraryTasks.id, itemId)).returning();
  return NextResponse.json({ data: { id: data.id, title: data.title, status: data.completed ? "done" : "open", created_at: data.createdAt } }, { status: 200 });
}

export async function DELETE(request: Request, context: RouteContext) {
  const { id: itineraryId, segmentId, itemId } = await context.params;
  const body = await request.json();
  const userId = body?.user_id as string | undefined;
  if (!itineraryId || !segmentId || !itemId || !userId) return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
  if (!(await canAccess(itineraryId, userId))) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const [existing] = await db.select().from(itineraryTasks).where(eq(itineraryTasks.id, itemId)).limit(1);
  if (!existing || existing.segmentId !== segmentId) return NextResponse.json({ error: "Item not found" }, { status: 404 });
  await db.delete(itineraryTasks).where(eq(itineraryTasks.id, itemId));
  return NextResponse.json({ success: true }, { status: 200 });
}
