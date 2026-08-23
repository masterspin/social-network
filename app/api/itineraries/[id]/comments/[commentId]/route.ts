import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { itineraryComments, itineraryTravelers, itineraries } from "@/lib/db/schema";

type RouteContext = { params: Promise<{ id: string; commentId: string }> };

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
  const { id: itineraryId, commentId } = await context.params;
  const body = await request.json();
  const userId = body?.user_id as string | undefined;
  if (!itineraryId || !commentId || !userId || typeof body.body !== "string") return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
  const [comment] = await db.select().from(itineraryComments).where(eq(itineraryComments.id, commentId)).limit(1);
  if (!comment) return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  if (comment.authorId !== userId || comment.itineraryId !== itineraryId) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const [data] = await db.update(itineraryComments).set({ body: body.body.trim() }).where(eq(itineraryComments.id, commentId)).returning();
  return NextResponse.json({ data }, { status: 200 });
}

export async function DELETE(request: Request, context: RouteContext) {
  const { id: itineraryId, commentId } = await context.params;
  const body = await request.json();
  const userId = body?.user_id as string | undefined;
  if (!itineraryId || !commentId || !userId) return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
  const [comment] = await db.select().from(itineraryComments).where(eq(itineraryComments.id, commentId)).limit(1);
  if (!comment) return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  if (comment.authorId !== userId || comment.itineraryId !== itineraryId) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  await db.delete(itineraryComments).where(eq(itineraryComments.id, commentId));
  return NextResponse.json({ success: true }, { status: 200 });
}
