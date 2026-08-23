import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { connections } from "@/lib/db/schema";

export async function POST(request: Request) {
  const body = await request.json();
  const connectionId = body?.connectionId as string | undefined;
  const status = body?.status as "accepted" | "rejected" | undefined;

  if (!connectionId || !status) {
    return NextResponse.json({ error: { message: "Missing required fields" } }, { status: 400 });
  }

  const [row] = await db
    .update(connections)
    .set({ status })
    .where(eq(connections.id, connectionId))
    .returning();

  return NextResponse.json({ data: row ?? null }, { status: 200 });
}
