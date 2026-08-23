import { eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { blockedUsers, connections, profiles, users } from "@/lib/db/schema";
import {
  getWeightedShortestPath,
  type WeightedConnectionType,
} from "@/lib/network/weighted-path";

function pairKey(a: string, b: string) {
  return [a, b].sort().join("__");
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source");
  const target = searchParams.get("target");

  if (!source || !target) {
    return NextResponse.json(
      { error: { message: "Missing source or target" } },
      { status: 400 },
    );
  }

  try {
    const [connectionRows, blockRows] = await Promise.all([
      db
        .select()
        .from(connections)
        .where(eq(connections.status, "accepted")),
      db.select().from(blockedUsers),
    ]);
    const blockedPairs = new Set(
      blockRows.map((row) => pairKey(row.blockerId, row.blockedId)),
    );

    const edges = connectionRows
      .filter((row) => {
        return (
          row.connectionType &&
          !blockedPairs.has(pairKey(row.requesterId, row.recipientId))
        );
      })
      .flatMap((row) => {
        const type = row.connectionType as WeightedConnectionType;
        return [
          { from: row.requesterId, to: row.recipientId, type },
          { from: row.recipientId, to: row.requesterId, type },
        ];
      });

    const result = getWeightedShortestPath({ source, target, edges });
    if (!result) {
      return NextResponse.json({ data: { path: null } }, { status: 200 });
    }

    const connectionByPair = new Map(
      connectionRows.map((row) => [pairKey(row.requesterId, row.recipientId), row]),
    );
    const links = result.nodeIds.slice(0, -1).map((from, index) => {
      const to = result.nodeIds[index + 1];
      const connection = connectionByPair.get(pairKey(from, to));
      return {
        source: from,
        target: to,
        connection_type: connection?.connectionType ?? "first",
      };
    });

    const userRows = await db
      .select({
        id: users.id,
        name: users.name,
        preferred_name: profiles.preferredName,
        profile_image_url: profiles.profileImageUrl,
      })
      .from(users)
      .leftJoin(profiles, eq(users.id, profiles.id))
      .where(inArray(users.id, result.nodeIds));
    const userById = new Map(userRows.map((row) => [row.id, row]));

    return NextResponse.json(
      {
        data: {
          path: result.nodeIds.map((id) => userById.get(id) ?? { id }),
          links,
          nodeIds: result.nodeIds,
          totalWeight: result.totalWeight,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: { message: (error as Error).message } },
      { status: 500 },
    );
  }
}
