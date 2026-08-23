import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { connections } from "@/lib/db/schema";

// Counter an incoming pending request by flipping direction safely.
// Body: { connectionId: string, currentUserId: string, how_met: string }
export async function POST(request: Request) {
  try {
    const { connectionId, currentUserId, how_met, connection_type } =
      await request.json();
    if (!connectionId || !currentUserId || typeof how_met !== "string") {
      return NextResponse.json(
        { error: { message: "Missing connectionId/currentUserId/how_met" } },
        { status: 400 }
      );
    }

    // Load the original connection
    const [conn] = await db
      .select({
        id: connections.id,
        requester_id: connections.requesterId,
        recipient_id: connections.recipientId,
        status: connections.status,
        connection_type: connections.connectionType,
      })
      .from(connections)
      .where(eq(connections.id, connectionId))
      .limit(1);
    if (!conn) return NextResponse.json({ data: null }, { status: 200 });

    // Validate it's an incoming pending to current user
    if (conn.recipient_id !== currentUserId || conn.status !== "pending") {
      return NextResponse.json(
        { error: { message: "Connection not amendable by user" } },
        { status: 403 }
      );
    }

    const otherId = conn.requester_id;
    const typeToUse = connection_type || conn.connection_type || "first";

    // Check if a reversed row already exists
    const [existingReverse] = await db
      .select({ id: connections.id })
      .from(connections)
      .where(and(eq(connections.requesterId, currentUserId), eq(connections.recipientId, otherId)))
      .limit(1);

    if (existingReverse && existingReverse.id !== conn.id) {
      // Update the existing reverse, remove the original
      const [up] = await db
        .update(connections)
        .set({ howMet, connectionType: typeToUse, status: "pending" })
        .where(eq(connections.id, existingReverse.id))
        .returning();
      await db.delete(connections).where(eq(connections.id, conn.id));
      return NextResponse.json({ data: up }, { status: 200 });
    }

    const [upd] = await db
      .update(connections)
      .set({
        requesterId: currentUserId,
        recipientId: otherId,
        howMet,
        connectionType: typeToUse,
        status: "pending",
      })
      .where(eq(connections.id, conn.id))
      .returning();
    return NextResponse.json({ data: upd }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { error: { message: (e as Error).message } },
      { status: 500 }
    );
  }
}
