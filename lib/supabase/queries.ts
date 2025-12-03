import { supabase } from "./client";
import type { Database } from "@/types/supabase";

// Auth functions
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  return { error };
}

export async function getCurrentUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  return { user, error };
}

// User profile functions
export async function getUserProfile(userId: string) {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .single();
  return { data, error };
}

// Helper table type aliases
type UsersTable = Database["public"]["Tables"]["users"];
type ConnectionsTable = Database["public"]["Tables"]["connections"];
type SocialLinksTable = Database["public"]["Tables"]["social_links"];
// type BlockedUsersTable = Database["public"]["Tables"]["blocked_users"]; // not needed directly
type BasicUser = Pick<
  UsersTable["Row"],
  "id" | "username" | "name" | "preferred_name" | "profile_image_url"
>;

// Sanitize user-provided text for use inside PostgREST `.or()` filters.
// - Removes commas and parentheses which have special meaning in PostgREST OR syntax
// - Trims and collapses whitespace
// - Optionally limit length to avoid overly long filters
function sanitizeForOr(value: string, maxLen = 128) {
  const cleaned = value.replace(/[(),]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, maxLen);
}

export async function createUserProfile(profile: UsersTable["Insert"]) {
  const { data, error } = await supabase
    .from("users")
    .insert(profile)
    .select()
    .single();
  return { data, error };
}

export async function updateUserProfile(
  userId: string,
  updates: UsersTable["Update"]
) {
  const { data, error } = await supabase
    .from("users")
    .update(updates)
    .eq("id", userId)
    .select()
    .single();
  return { data, error };
}

export async function checkUsernameAvailable(username: string) {
  // Use count to check if username exists - more reliable than select
  const { count, error } = await supabase
    .from("users")
    .select("*", { count: "exact", head: true })
    .eq("username", username);

  console.log("checkUsernameAvailable query result:", {
    username,
    count,
    error,
  });

  // If there's an error
  if (error) {
    console.error("Error checking username:", error);
    return { available: false, error };
  }

  // If count is 0, username is available
  // If count > 0, username is taken
  return { available: count === 0, error: null };
}

//
// Connection search (Supabase-only)
//

// Redone connection search using ONLY Supabase query builder
// - Text match on username, name, preferred_name (ilike)
// - Excludes the requester (AND filter)
// - Excludes users blocked by requester or who have blocked requester
// - No custom Postgres functions, no client-side ranking
export async function searchConnections(query: string, requesterId: string) {
  const q = sanitizeForOr(query);
  if (!q) return { data: [] as BasicUser[], error: null };

  // Get all blocks involving the requester (both directions) without using an OR chain
  const [{ data: iBlocked, error: e1 }, { data: blockedMe, error: e2 }] =
    await Promise.all([
      supabase
        .from("blocked_users")
        .select("blocked_id")
        .eq("blocker_id", requesterId),
      supabase
        .from("blocked_users")
        .select("blocker_id")
        .eq("blocked_id", requesterId),
    ]);

  if (e1 || e2) {
    // If block lookup fails, proceed without block filtering rather than fail the whole search
    const { data, error } = await supabase
      .from("users")
      .select("id, username, name, preferred_name, profile_image_url")
      .or(`username.ilike.%${q}%,name.ilike.%${q}%,preferred_name.ilike.%${q}%`)
      .neq("id", requesterId)
      .order("username", { ascending: true })
      .limit(20);

    return { data: (data as BasicUser[]) || [], error };
  }

  const blockedIds = new Set<string>();
  (iBlocked || []).forEach((row: { blocked_id: string }) =>
    blockedIds.add(row.blocked_id)
  );
  (blockedMe || []).forEach((row: { blocker_id: string }) =>
    blockedIds.add(row.blocker_id)
  );

  // Fetch candidates via text search and filter out blocked locally (avoids tricky NOT IN syntax)
  const { data: candidates, error } = await supabase
    .from("users")
    .select("id, username, name, preferred_name, profile_image_url")
    .or(`username.ilike.%${q}%,name.ilike.%${q}%,preferred_name.ilike.%${q}%`)
    .neq("id", requesterId)
    .order("username", { ascending: true })
    .limit(50);

  const filtered = ((candidates as BasicUser[]) || []).filter(
    (u) => !blockedIds.has(u.id)
  );

  return { data: filtered.slice(0, 20), error };
}

// Minimal helper: list all users or filter by query across username/name/preferred_name
// No requester filtering, no blocks – intended for quick manual testing.
export async function listUsersByQuery(query: string) {
  const q = sanitizeForOr(query ?? "");
  const base = supabase
    .from("users")
    .select("id, username, name, preferred_name, profile_image_url")
    .order("username", { ascending: true });

  if (!q) {
    const { data, error } = await base.limit(200);
    return { data: (data as BasicUser[]) || [], error };
  }

  const { data, error } = await base
    .or(`username.ilike.%${q}%,name.ilike.%${q}%,preferred_name.ilike.%${q}%`)
    .limit(200);
  return { data: (data as BasicUser[]) || [], error };
}

// Social links functions
export async function getUserSocialLinks(userId: string) {
  const { data, error } = await supabase
    .from("social_links")
    .select("*")
    .eq("user_id", userId);
  return { data, error };
}

export async function addSocialLink(link: SocialLinksTable["Insert"]) {
  const { data, error } = await supabase
    .from("social_links")
    .insert(link)
    .select()
    .single();
  return { data, error };
}

export async function deleteSocialLink(linkId: string) {
  const { error } = await supabase
    .from("social_links")
    .delete()
    .eq("id", linkId);
  return { error };
}

// Connection functions
export async function getUserConnections(userId: string) {
  const { data, error } = await supabase
    .from("connections")
    .select(
      `
      *,
      requester:users!connections_requester_id_fkey(id, username, name, preferred_name, profile_image_url),
      recipient:users!connections_recipient_id_fkey(id, username, name, preferred_name, profile_image_url),
      met_through:users!connections_met_through_id_fkey(id, username, name, preferred_name)
    `
    )
    .or(`requester_id.eq.${userId},recipient_id.eq.${userId}`)
    .eq("status", "accepted");
  return { data, error };
}

export async function getPendingConnectionRequests(userId: string) {
  const { data, error } = await supabase
    .from("connections")
    .select(
      `
      *,
      requester:users!connections_requester_id_fkey(id, username, name, preferred_name, profile_image_url),
      recipient:users!connections_recipient_id_fkey(id, username, name, preferred_name, profile_image_url),
      met_through:users!connections_met_through_id_fkey(id, username, name, preferred_name)
    `
    )
    .eq("recipient_id", userId)
    .eq("status", "pending");
  return { data, error };
}

export async function getSentConnectionRequests(userId: string) {
  const { data, error } = await supabase
    .from("connections")
    .select(
      `
      *,
      requester:users!connections_requester_id_fkey(id, username, name, preferred_name, profile_image_url),
      recipient:users!connections_recipient_id_fkey(id, username, name, preferred_name, profile_image_url),
      met_through:users!connections_met_through_id_fkey(id, username, name, preferred_name)
    `
    )
    .eq("requester_id", userId)
    .eq("status", "pending");
  return { data, error };
}

// Get the most recent connection record between two users (either direction)
export async function getConnectionBetweenUsers(aId: string, bId: string) {
  const { data, error } = await supabase
    .from("connections")
    .select(
      `
      *,
      requester:users!connections_requester_id_fkey(id, username, name, preferred_name, profile_image_url),
      recipient:users!connections_recipient_id_fkey(id, username, name, preferred_name, profile_image_url),
      met_through:users!connections_met_through_id_fkey(id, username, name, preferred_name)
    `
    )
    .or(
      `and(requester_id.eq.${aId},recipient_id.eq.${bId}),and(requester_id.eq.${bId},recipient_id.eq.${aId})`
    )
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  return { data, error };
}

export async function createConnectionRequest(
  connection: ConnectionsTable["Insert"]
) {
  const { data, error } = await supabase
    .from("connections")
    .insert(connection)
    .select()
    .single();
  return { data, error };
}

export async function updateConnectionStatus(
  connectionId: string,
  status: "accepted" | "rejected"
) {
  const { data, error } = await supabase
    .from("connections")
    .update({ status })
    .eq("id", connectionId)
    .select()
    .single();
  return { data, error };
}

export async function deleteConnection(connectionId: string) {
  const { error } = await supabase
    .from("connections")
    .delete()
    .eq("id", connectionId);
  return { error };
}

// Update pending connection request details (only allowed while pending)
export async function updateConnectionRequestDetails(
  connectionId: string,
  updates: {
    how_met?: string;
    met_through_id?: string | null;
  }
) {
  const { data, error } = await supabase
    .from("connections")
    .update(updates)
    .eq("id", connectionId)
    .eq("status", "pending")
    .select()
    .single();
  return { data, error };
}

// Calculate connection distance
export async function getConnectionDistance(
  fromUserId: string,
  toUserId: string
) {
  const { data, error } = await supabase.rpc("calculate_connection_distance", {
    from_user_id: fromUserId,
    to_user_id: toUserId,
  });
  return { data, error };
}

// Get full network data for visualization
export async function getNetworkData(userId: string) {
  // Get all accepted connections
  const { data: connections, error: connectionsError } = await supabase
    .from("connections")
    .select(
      `
      *,
      requester:users!connections_requester_id_fkey(id, username, name, preferred_name, profile_image_url, visibility_level, show_profile_image, show_full_name),
      recipient:users!connections_recipient_id_fkey(id, username, name, preferred_name, profile_image_url, visibility_level, show_profile_image, show_full_name),
      met_through:users!connections_met_through_id_fkey(id, username, name, preferred_name)
    `
    )
    .eq("status", "accepted");

  if (connectionsError) {
    return { data: null, error: connectionsError };
  }

  // Build graph structure
  interface NetworkNode {
    id: string;
    username: string;
    name: string;
    preferred_name: string | null;
    profile_image_url: string | null;
    distance?: number;
    show_profile_image?: boolean;
    show_full_name?: boolean;
  }

  interface NetworkEdge {
    source: string;
    target: string;
    label: string;
    how_met: string;
    met_through: {
      id: string;
      username: string;
      name: string;
      preferred_name: string | null;
    } | null;
  }

  const nodes = new Map<string, NetworkNode>();
  const edges: NetworkEdge[] = [];

  // Add current user as center node
  const { data: currentUserData } = await getUserProfile(userId);
  if (currentUserData) {
    nodes.set(userId, {
      id: userId,
      username: currentUserData.username,
      name: currentUserData.name,
      preferred_name: currentUserData.preferred_name,
      profile_image_url: currentUserData.profile_image_url,
      distance: 0,
    });
  }

  // Process connections
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  connections?.forEach((conn: any) => {
    const requester = conn.requester;
    const recipient = conn.recipient;

    // Add nodes if not exists
    if (!nodes.has(requester.id)) {
      nodes.set(requester.id, {
        id: requester.id,
        username: requester.username,
        name: requester.name,
        preferred_name: requester.preferred_name,
        profile_image_url: requester.profile_image_url,
        show_profile_image: requester.show_profile_image,
        show_full_name: requester.show_full_name,
      });
    }

    if (!nodes.has(recipient.id)) {
      nodes.set(recipient.id, {
        id: recipient.id,
        username: recipient.username,
        name: recipient.name,
        preferred_name: recipient.preferred_name,
        profile_image_url: recipient.profile_image_url,
        show_profile_image: recipient.show_profile_image,
        show_full_name: recipient.show_full_name,
      });
    }

    // Add edge
    edges.push({
      source: requester.id,
      target: recipient.id,
      label: conn.how_met,
      how_met: conn.how_met,
      met_through: conn.met_through,
    });
  });

  return {
    data: {
      nodes: Array.from(nodes.values()),
      edges,
    },
    error: null,
  };
}

// Block user functions
export async function blockUser(blockerId: string, blockedId: string) {
  const { data, error } = await supabase
    .from("blocked_users")
    .insert({ blocker_id: blockerId, blocked_id: blockedId })
    .select()
    .single();
  return { data, error };
}

export async function unblockUser(blockerId: string, blockedId: string) {
  const { error } = await supabase
    .from("blocked_users")
    .delete()
    .eq("blocker_id", blockerId)
    .eq("blocked_id", blockedId);
  return { error };
}

export async function getBlockedUsers(blockerId: string) {
  const { data, error } = await supabase
    .from("blocked_users")
    .select(
      `
      *,
      blocked_user:users!blocked_users_blocked_id_fkey(id, name, preferred_name, profile_image_url)
    `
    )
    .eq("blocker_id", blockerId);
  return { data, error };
}

export async function isUserBlocked(blockerId: string, blockedId: string) {
  const { data, error } = await supabase
    .from("blocked_users")
    .select("id")
    .eq("blocker_id", blockerId)
    .eq("blocked_id", blockedId)
    .single();
  return { isBlocked: !!data, error };
}

// Get count of first connections for a user
export async function getFirstConnectionCount(userId: string) {
  const { count, error } = await supabase
    .from("connections")
    .select("*", { count: "exact", head: true })
    .or(`requester_id.eq.${userId},recipient_id.eq.${userId}`)
    .eq("connection_type", "first")
    .eq("status", "accepted");

  return { count: count || 0, error };
}

// Request to upgrade a connection type from 1.5 to 1st
export async function requestConnectionTypeUpgrade(
  connectionId: string,
  requesterId: string
) {
  const { data, error } = await supabase
    .from("connections")
    .update({
      upgrade_requested_type: "first",
      upgrade_requested_by: requesterId,
    })
    .eq("id", connectionId)
    .eq("status", "accepted")
    .eq("connection_type", "one_point_five")
    .select()
    .single();
  return { data, error };
}

// Downgrade a connection type from 1st to 1.5 (no approval needed)
export async function downgradeConnectionType(connectionId: string) {
  const { data, error } = await supabase
    .from("connections")
    .update({
      connection_type: "one_point_five",
      upgrade_requested_type: null,
      upgrade_requested_by: null,
    })
    .eq("id", connectionId)
    .eq("status", "accepted")
    .select()
    .single();
  return { data, error };
}

// Accept a connection type upgrade request
export async function acceptConnectionTypeUpgrade(connectionId: string) {
  const { data, error } = await supabase
    .from("connections")
    .update({
      connection_type: "first",
      upgrade_requested_type: null,
      upgrade_requested_by: null,
    })
    .eq("id", connectionId)
    .eq("status", "accepted")
    .select()
    .single();
  return { data, error };
}

// Reject a connection type upgrade request
export async function rejectConnectionTypeUpgrade(connectionId: string) {
  const { data, error } = await supabase
    .from("connections")
    .update({
      upgrade_requested_type: null,
      upgrade_requested_by: null,
    })
    .eq("id", connectionId)
    .eq("status", "accepted")
    .select()
    .single();
  return { data, error };
}

// Get pending connection type upgrade requests for a user
export async function getConnectionTypeUpgradeRequests(userId: string) {
  const { data, error } = await supabase
    .from("connections")
    .select(
      `
      *,
      requester:users!connections_requester_id_fkey(id, username, name, preferred_name, profile_image_url),
      recipient:users!connections_recipient_id_fkey(id, username, name, preferred_name, profile_image_url)
    `
    )
    .or(`requester_id.eq.${userId},recipient_id.eq.${userId}`)
    .eq("status", "accepted")
    .not("upgrade_requested_type", "is", null)
    .not("upgrade_requested_by", "eq", userId);
  return { data, error };
}

