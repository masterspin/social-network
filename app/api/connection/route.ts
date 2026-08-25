import { and, eq, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { connectionNotes, connections, profiles, users } from "@/lib/db/schema";
import { toClientConnectionRow } from "@/lib/connection-shape";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const a = searchParams.get("a");
  const b = searchParams.get("b");

  if (!a || !b) {
    return NextResponse.json(
      { error: { message: "Missing user pair (a, b)" } },
      { status: 400 }
    );
  }

  try {
    const [row] = await db
      .select()
      .from(connections)
      .where(or(and(eq(connections.requesterId, a), eq(connections.recipientId, b)), and(eq(connections.requesterId, b), eq(connections.recipientId, a))))
      .orderBy(connections.createdAt)
      .limit(1);

    if (!row) return NextResponse.json({ data: null }, { status: 200 });

    const userSelection = {
      id: users.id,
      name: users.name,
      preferred_name: profiles.preferredName,
      profile_image_url: profiles.profileImageUrl,
    };
    const [requester] = await db.select(userSelection).from(users).leftJoin(profiles, eq(users.id, profiles.id)).where(eq(users.id, row.requesterId)).limit(1);
    const [recipient] = await db.select(userSelection).from(users).leftJoin(profiles, eq(users.id, profiles.id)).where(eq(users.id, row.recipientId)).limit(1);
    const [myNote] = await db
      .select({ connectionType: connectionNotes.connectionType })
      .from(connectionNotes)
      .where(
        and(
          eq(connectionNotes.connectionId, row.id),
          eq(connectionNotes.userId, a),
        ),
      )
      .limit(1);

    return NextResponse.json(
      {
        data: {
          ...toClientConnectionRow({
            ...row,
            myConnectionType: myNote?.connectionType ?? "one_point_five",
          }),
          requester,
          recipient,
        },
      },
      { status: 200 },
    );
  } catch (e) {
    return NextResponse.json(
      { error: { message: (e as Error).message } },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as Record<string, unknown>;
  const requesterId = body.requester_id as string | undefined;
  const recipientId = body.recipient_id as string | undefined;
  const howMet = body.how_met as string | undefined;
  const status = (body.status as "pending" | "accepted" | "rejected" | undefined) ?? "pending";

  if (!requesterId || !recipientId || !howMet) {
    return NextResponse.json(
      { error: { message: "Missing required connection fields" } },
      { status: 400 }
    );
  }

  try {
    const [existing] = await db
      .select()
      .from(connections)
      .where(
        or(
          and(
            eq(connections.requesterId, requesterId),
            eq(connections.recipientId, recipientId),
          ),
          and(
            eq(connections.requesterId, recipientId),
            eq(connections.recipientId, requesterId),
          ),
        ),
      )
      .orderBy(connections.createdAt)
      .limit(1);

    if (existing) {
      if (existing.status === "rejected") {
        const [row] = await db
          .update(connections)
          .set({
            requesterId,
            recipientId,
            howMet,
            status: "pending",
          })
          .where(eq(connections.id, existing.id))
          .returning();

        return NextResponse.json(
          { data: row ? toClientConnectionRow(row) : null },
          { status: 200 },
        );
      }

      const reversePending =
        existing.status === "pending" &&
        existing.requesterId === recipientId &&
        existing.recipientId === requesterId;

      return NextResponse.json(
        {
          data: toClientConnectionRow(existing),
          error: {
            message: reversePending
              ? "This person already sent you a request. Accept it instead."
              : existing.status === "pending"
                ? "Connection request already pending."
                : "Connection already exists.",
          },
        },
        { status: 409 },
      );
    }

    const [row] = await db
      .insert(connections)
      .values({
        requesterId,
        recipientId,
        howMet,
        status,
      })
      .returning();

    return NextResponse.json(
      { data: row ? toClientConnectionRow(row) : null },
      { status: 200 },
    );
  } catch (e) {
    return NextResponse.json(
      { error: { message: (e as Error).message } },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const connectionId = new URL(request.url).searchParams.get("connectionId");

  if (!connectionId) {
    return NextResponse.json(
      { error: { message: "Missing connectionId" } },
      { status: 400 }
    );
  }

  try {
    await db.delete(connections).where(eq(connections.id, connectionId));
    return NextResponse.json({ data: { deleted: true } }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { error: { message: (e as Error).message } },
      { status: 500 }
    );
  }
}
