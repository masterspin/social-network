import { eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  blockedUsers,
  connectionNotes,
  connections,
  profiles,
  users,
} from "@/lib/db/schema";
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
    const [connectionRows, blockRows, noteRows] = await Promise.all([
      db
        .select()
        .from(connections)
        .where(eq(connections.status, "accepted")),
      db.select().from(blockedUsers),
      db.select().from(connectionNotes),
    ]);
    const blockedPairs = new Set(
      blockRows.map((row) => pairKey(row.blockerId, row.blockedId)),
    );

    const typeByConnectionAndUser = new Map(
      noteRows.map((note) => [
        `${note.connectionId}:${note.userId}`,
        note.connectionType || "one_point_five",
      ]),
    );
    const edges = connectionRows
      .filter((row) => {
        return (
          !blockedPairs.has(pairKey(row.requesterId, row.recipientId))
        );
      })
      .flatMap((row) => {
        return [
          {
            from: row.requesterId,
            to: row.recipientId,
            type: (typeByConnectionAndUser.get(`${row.id}:${row.requesterId}`) ||
              "one_point_five") as WeightedConnectionType,
          },
          {
            from: row.recipientId,
            to: row.requesterId,
            type: (typeByConnectionAndUser.get(`${row.id}:${row.recipientId}`) ||
              "one_point_five") as WeightedConnectionType,
          },
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
        connection_type: connection
          ? typeByConnectionAndUser.get(`${connection.id}:${from}`) ||
            "one_point_five"
          : "one_point_five",
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
