import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  itineraryOwnerInvitations,
  itineraryTravelers,
  itineraries,
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

async function isOwner(itineraryId: string, userId: string) {
  const [itinerary] = await db
    .select({ ownerId: itineraries.ownerId })
    .from(itineraries)
    .where(eq(itineraries.id, itineraryId))
    .limit(1);
  return Boolean(itinerary && itinerary.ownerId === userId);
}

export async function GET(request: Request, context: RouteContext) {
  const { id: itineraryId } = await context.params;
  const userId = await resolveUserId(request);
  if (!itineraryId || !userId) return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
  if (!(await isOwner(itineraryId, userId))) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const data = await db
    .select()
    .from(itineraryOwnerInvitations)
    .where(eq(itineraryOwnerInvitations.itineraryId, itineraryId));

  return NextResponse.json({ data }, { status: 200 });
}

export async function POST(request: Request, context: RouteContext) {
  const { id: itineraryId } = await context.params;
  const body = await request.json();
  const ownerId = body?.owner_id as string | undefined;
  const inviteeId = body?.invitee_id as string | undefined;
  if (!itineraryId || !ownerId || !inviteeId) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  const resolvedUserId = await resolveUserId(request);
  if (!resolvedUserId || resolvedUserId !== ownerId) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  if (!(await isOwner(itineraryId, ownerId))) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  if (ownerId === inviteeId) return NextResponse.json({ error: "You cannot invite yourself" }, { status: 400 });

  const [itinerary] = await db.select({ ownerId: itineraries.ownerId }).from(itineraries).where(eq(itineraries.id, itineraryId)).limit(1);
  if (!itinerary) return NextResponse.json({ error: "Itinerary not found" }, { status: 404 });
  if (itinerary.ownerId === inviteeId) return NextResponse.json({ error: "This user is already an owner" }, { status: 409 });

  const [existingTraveler] = await db.select().from(itineraryTravelers).where(and(eq(itineraryTravelers.itineraryId, itineraryId), eq(itineraryTravelers.userId, inviteeId))).limit(1);
  const [pendingInvite] = await db.select().from(itineraryOwnerInvitations).where(and(eq(itineraryOwnerInvitations.itineraryId, itineraryId), eq(itineraryOwnerInvitations.invitedUserId, inviteeId))).limit(1);
  if (pendingInvite) return NextResponse.json({ error: "An invitation is already pending" }, { status: 409 });

  if (!existingTraveler) await db.insert(itineraryTravelers).values({ itineraryId, userId: inviteeId });

  const [data] = await db.insert(itineraryOwnerInvitations).values({ itineraryId, invitedUserId: inviteeId }).returning();
  return NextResponse.json({ data }, { status: 201 });
}
