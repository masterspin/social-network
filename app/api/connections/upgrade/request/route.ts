import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { connections } from "@/lib/db/schema";

export async function POST(request: Request) {
  try {
    const { connectionId, requesterId } = (await request.json()) as {
      connectionId?: string;
      requesterId?: string;
    };

    if (!connectionId || !requesterId) {
      return NextResponse.json(
        { error: { message: "connectionId and requesterId are required" } },
        { status: 400 }
      );
    }

    const [connection] = await db
      .select()
      .from(connections)
      .where(eq(connections.id, connectionId))
      .limit(1);
    if (!connection) return NextResponse.json({ error: { message: "Connection not found" } }, { status: 404 });

    if (connection.requesterId !== requesterId && connection.recipientId !== requesterId) {
      return NextResponse.json({ error: { message: "You are not part of this connection" } }, { status: 403 });
    }
    if (connection.status !== "accepted") {
      return NextResponse.json({ error: { message: "Only accepted connections can be upgraded" } }, { status: 400 });
    }
    if (connection.connectionType !== "one_point_five") {
      return NextResponse.json({ error: { message: "Upgrade requests are only allowed for Weak connections" } }, { status: 409 });
    }

    const [updated] = await db
      .update(connections)
      .set({
        upgradeRequestedType: "first",
        upgradeRequestedBy: requesterId,
      })
      .where(and(eq(connections.id, connectionId), eq(connections.status, "accepted")))
      .returning();

    return NextResponse.json({ data: updated }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: { message: (error as Error).message } }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { connectionId, action } = (await request.json()) as {
      connectionId?: string;
      action?: "accept" | "reject";
    };

    if (!connectionId || !action) {
      return NextResponse.json(
        { error: { message: "connectionId and action are required" } },
        { status: 400 },
      );
    }

    const [connection] = await db
      .select()
      .from(connections)
      .where(eq(connections.id, connectionId))
      .limit(1);

    if (!connection) {
      return NextResponse.json(
        { error: { message: "Connection not found" } },
        { status: 404 },
      );
    }

    if (!connection.upgradeRequestedType) {
      return NextResponse.json(
        { error: { message: "No upgrade request pending" } },
        { status: 400 },
      );
    }

    const [updated] = await db
      .update(connections)
      .set({
        ...(action === "accept"
          ? { connectionType: connection.upgradeRequestedType }
          : {}),
        upgradeRequestedType: null,
        upgradeRequestedBy: null,
      })
      .where(eq(connections.id, connectionId))
      .returning();

    return NextResponse.json({ data: updated ?? null }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: { message: (error as Error).message } },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const connectionId = new URL(request.url).searchParams.get("connectionId");

    if (!connectionId) {
      return NextResponse.json(
        { error: { message: "connectionId is required" } },
        { status: 400 },
      );
    }

    const [updated] = await db
      .update(connections)
      .set({
        upgradeRequestedType: null,
        upgradeRequestedBy: null,
      })
      .where(eq(connections.id, connectionId))
      .returning();

    return NextResponse.json({ data: updated ?? null }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: { message: (error as Error).message } },
      { status: 500 },
    );
  }
}
