const IS_DEV = process.env.NEXT_PUBLIC_DEV_MODE === "true";

export type CurrentUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
};

async function getServerDeps() {
  const [{ and, asc, desc, eq, or, sql }, { auth }, { db }, schema] =
    await Promise.all([
      import("drizzle-orm"),
      import("@/auth"),
      import("@/lib/db"),
      import("@/lib/db/schema"),
    ]);

  return { and, asc, desc, eq, or, sql, auth, db, ...schema };
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? payload?.error ?? "Request failed");
  }
  return payload as T;
}

function mapUserRow(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    email: row.email as string | null,
    name: (row.name as string | null) ?? "",
    preferred_name: (row.preferred_name as string | null) ?? null,
    gender: (row.gender as string | null) ?? null,
    bio: (row.bio as string | null) ?? null,
    profile_image_url: (row.profile_image_url as string | null) ?? null,
    created_at: row.created_at as string | null,
    updated_at: row.updated_at as string | null,
  };
}

export async function signOut() {
  return { error: null };
}

export async function getCurrentUser(): Promise<{ user: CurrentUser | null; error: null }> {
  if (IS_DEV) return { user: { id: "dev", email: "dev@example.com" }, error: null };
  if (typeof window !== "undefined") {
    const payload = await fetchJson<{ user: CurrentUser | null }>("/api/me");
    return { user: payload.user, error: null };
  }
  const { auth } = await getServerDeps();
  const session = await auth();
  const sessionUser = session?.user as CurrentUser | undefined;
  return { user: sessionUser?.id ? sessionUser : null, error: null };
}

export async function getUserProfile(userId: string) {
  if (typeof window !== "undefined") {
    const payload = await fetchJson<{ data: unknown | null }>(`/api/profile/${userId}`);
    const value = (payload.data as { user?: unknown } | null)?.user ?? payload.data;
    return { data: value ? mapUserRow(value as Record<string, unknown>) : null, error: null };
  }
  const { db, eq, profiles } = await getServerDeps();
  const row = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
  return { data: row[0] ? mapUserRow(row[0] as Record<string, unknown>) : null, error: null };
}

export async function createUserProfile(profile: Record<string, unknown>) {
  const { db, profiles } = await getServerDeps();
  const data = await db.insert(profiles).values(profile as never).returning();
  return { data: data[0] ?? null, error: null };
}

export async function updateUserProfile(userId: string, updates: Record<string, unknown>) {
  const { db, eq, profiles } = await getServerDeps();
  const data = await db.update(profiles).set(updates as never).where(eq(profiles.id, userId)).returning();
  return { data: data[0] ?? null, error: null };
}

export async function getUserSocialLinks(userId: string) {
  if (typeof window !== "undefined") {
    const payload = await fetchJson<{ data: unknown[] }>(
      `/api/social-links?userId=${encodeURIComponent(userId)}`,
    );
    return { data: payload.data, error: null };
  }
  const { db, asc, eq, socialLinks } = await getServerDeps();
  const data = await db.select().from(socialLinks).where(eq(socialLinks.userId, userId)).orderBy(asc(socialLinks.createdAt));
  return { data, error: null };
}

export async function addSocialLink(link: Record<string, unknown>) {
  if (typeof window !== "undefined") {
    const payload = await fetchJson<{ data: unknown | null }>("/api/social-links", {
      method: "POST",
      body: JSON.stringify(link),
    });
    return { data: payload.data, error: null };
  }
  const { db, socialLinks } = await getServerDeps();
  const data = await db.insert(socialLinks).values(link as never).returning();
  return { data: data[0] ?? null, error: null };
}

export async function deleteSocialLink(linkId: string) {
  if (typeof window !== "undefined") {
    await fetchJson<{ data: unknown }>(
      `/api/social-links?linkId=${encodeURIComponent(linkId)}`,
      { method: "DELETE" },
    );
    return { error: null };
  }
  const { db, eq, socialLinks } = await getServerDeps();
  await db.delete(socialLinks).where(eq(socialLinks.id, linkId));
  return { error: null };
}

export async function getUserConnections(userId: string) {
  const { db, desc, eq, or, connections } = await getServerDeps();
  const data = await db.select().from(connections).where(or(eq(connections.requesterId, userId), eq(connections.recipientId, userId))).orderBy(desc(connections.createdAt));
  return { data, error: null };
}

export async function getPendingConnectionRequests(userId: string) {
  const { db, and, desc, eq, connections } = await getServerDeps();
  const data = await db.select().from(connections).where(and(eq(connections.recipientId, userId), eq(connections.status, "pending"))).orderBy(desc(connections.createdAt));
  return { data, error: null };
}

export async function getSentConnectionRequests(userId: string) {
  const { db, and, desc, eq, connections } = await getServerDeps();
  const data = await db.select().from(connections).where(and(eq(connections.requesterId, userId), eq(connections.status, "pending"))).orderBy(desc(connections.createdAt));
  return { data, error: null };
}

export async function getConnectionBetweenUsers(aId: string, bId: string) {
  const { db, and, desc, eq, or, connections } = await getServerDeps();
  const data = await db.select().from(connections).where(or(and(eq(connections.requesterId, aId), eq(connections.recipientId, bId)), and(eq(connections.requesterId, bId), eq(connections.recipientId, aId)))).orderBy(desc(connections.createdAt)).limit(1);
  return { data: data[0] ?? null, error: null };
}

export async function createConnectionRequest(connection: Record<string, unknown>) {
  const { db, connections } = await getServerDeps();
  const data = await db.insert(connections).values(connection as never).returning();
  return { data: data[0] ?? null, error: null };
}

export async function updateConnectionStatus(connectionId: string, status: "accepted" | "rejected") {
  const { db, eq, connections } = await getServerDeps();
  const data = await db.update(connections).set({ status }).where(eq(connections.id, connectionId)).returning();
  return { data: data[0] ?? null, error: null };
}

export async function deleteConnection(connectionId: string) {
  const { db, eq, connections } = await getServerDeps();
  await db.delete(connections).where(eq(connections.id, connectionId));
  return { error: null };
}

export async function updateConnectionRequestDetails(connectionId: string, updates: { how_met?: string; connection_type?: "first" | "one_point_five" }) {
  const { db, and, eq, connections } = await getServerDeps();
  const data = await db.update(connections).set(updates as never).where(and(eq(connections.id, connectionId), eq(connections.status, "pending"))).returning();
  return { data: data[0] ?? null, error: null };
}

export async function getConnectionDistance() {
  return { data: 0, error: null };
}

export async function getNetworkData(userId: string) {
  const { db, eq, connections } = await getServerDeps();
  const current = await getUserProfile(userId);
  const accepted = await db.select().from(connections).where(eq(connections.status, "accepted"));
  return {
    data: {
      nodes: current.data ? [current.data] : [],
      edges: accepted.map((c) => ({ source: c.requesterId, target: c.recipientId, label: c.howMet, how_met: c.howMet })),
    },
    error: null,
  };
}

export async function isUserBlocked(blockerId: string, blockedId: string) {
  const { db, and, eq, blockedUsers } = await getServerDeps();
  const rows = await db.select({ id: blockedUsers.id }).from(blockedUsers).where(and(eq(blockedUsers.blockerId, blockerId), eq(blockedUsers.blockedId, blockedId))).limit(1);
  return { isBlocked: rows.length > 0, error: null };
}

export async function blockUser(blockerId: string, blockedId: string) {
  const { db, blockedUsers } = await getServerDeps();
  const data = await db.insert(blockedUsers).values({ blockerId, blockedId }).returning();
  return { data: data[0] ?? null, error: null };
}

export async function unblockUser(blockerId: string, blockedId: string) {
  const { db, and, eq, blockedUsers } = await getServerDeps();
  await db.delete(blockedUsers).where(and(eq(blockedUsers.blockerId, blockerId), eq(blockedUsers.blockedId, blockedId)));
  return { error: null };
}

export async function getBlockedUsers(blockerId: string) {
  if (typeof window !== "undefined") {
    const payload = await fetchJson<{ data: unknown[] }>(
      `/api/block?blockerId=${encodeURIComponent(blockerId)}`,
    );
    return { data: payload.data, error: null };
  }
  const { db, eq, blockedUsers } = await getServerDeps();
  const data = await db.select().from(blockedUsers).where(eq(blockedUsers.blockerId, blockerId));
  return { data, error: null };
}

export async function getFirstConnectionCount(userId: string) {
  const { db, and, eq, or, sql, connections } = await getServerDeps();
  const data = await db.select({ count: sql<number>`count(*)` }).from(connections).where(and(or(eq(connections.requesterId, userId), eq(connections.recipientId, userId)), eq(connections.connectionType, "first"), eq(connections.status, "accepted")));
  return { count: Number(data[0]?.count ?? 0), error: null };
}

export async function requestConnectionTypeUpgrade() { return { data: null, error: null }; }
export async function cancelConnectionTypeUpgradeRequest() { return { data: null, error: null }; }
export async function downgradeConnectionType() { return { data: null, error: null }; }
export async function removeConnection() { return { error: null }; }
export async function acceptConnectionTypeUpgrade() { return { data: null, error: null }; }
export async function rejectConnectionTypeUpgrade() { return { data: null, error: null }; }
export async function getConnectionTypeUpgradeRequests() { return { data: [], error: null }; }

export async function getAllUsers() {
  const { db, users } = await getServerDeps();
  return { data: await db.select().from(users), error: null };
}

export async function getMatches() { const { db, matches } = await getServerDeps(); return { data: await db.select().from(matches), error: null }; }
export async function getMatchChats(matchId: string) { const { db, asc, eq, matchChats } = await getServerDeps(); return { data: await db.select().from(matchChats).where(eq(matchChats.matchId, matchId)).orderBy(asc(matchChats.createdAt)), error: null }; }
