"use client";

import { useEffect, useState } from "react";
import {
  createConnectionRequest,
  updateConnectionStatus,
  deleteConnection,
  updateConnectionRequestDetails,
  isUserBlocked,
  getFirstConnectionCount,
  requestConnectionTypeUpgrade,
  downgradeConnectionType,
  acceptConnectionTypeUpgrade,
  rejectConnectionTypeUpgrade,
} from "@/lib/supabase/queries";
import type { Database } from "@/types/supabase";
import {
  FaInstagram,
  FaTwitter,
  FaLinkedin,
  FaFacebook,
  FaTiktok,
  FaDiscord,
  FaSnapchat,
} from "react-icons/fa";
import { FiExternalLink } from "react-icons/fi";

type Props = {
  open: boolean;
  currentUserId: string;
  userId: string;
  onClose: () => void;
  onChanged?: () => void; // called after accept/reject/send
};

type UserRow = Database["public"]["Tables"]["users"]["Row"];
type SocialLink = Database["public"]["Tables"]["social_links"]["Row"];
type ConnectionRow = Database["public"]["Tables"]["connections"]["Row"] & {
  requester: {
    id: string;
    name: string;
    preferred_name: string | null;
    profile_image_url: string | null;
    username?: string;
  };
  recipient: {
    id: string;
    name: string;
    preferred_name: string | null;
    profile_image_url: string | null;
    username?: string;
  };
  met_through: {
    id: string;
    username: string;
    name: string;
    preferred_name: string | null;
  } | null;
};

// no predefined connection types; use a free-form description + optional year

type IconType = React.ComponentType<{ className?: string }>;

const PLATFORM_META: Record<
  string,
  { icon: IconType; color: string; baseUrl?: string; prefix?: string }
> = {
  Instagram: {
    icon: FaInstagram,
    color: "text-pink-600",
    baseUrl: "https://instagram.com/",
    prefix: "@",
  },
  Twitter: {
    icon: FaTwitter,
    color: "text-blue-400",
    baseUrl: "https://twitter.com/",
    prefix: "@",
  },
  LinkedIn: {
    icon: FaLinkedin,
    color: "text-blue-700",
    // stored as full path prefix
    prefix: "linkedin.com/in/",
  },
  Facebook: {
    icon: FaFacebook,
    color: "text-blue-600",
    baseUrl: "https://facebook.com/",
    prefix: "@",
  },
  TikTok: {
    icon: FaTiktok,
    color: "text-black dark:text-white",
    baseUrl: "https://tiktok.com/",
    prefix: "@",
  },
  Discord: {
    icon: FaDiscord,
    color: "text-indigo-600",
    // usually not a URL; show raw value
  },
  Snapchat: {
    icon: FaSnapchat,
    color: "text-yellow-400",
    baseUrl: "https://snapchat.com/add/",
    prefix: "@",
  },
};

function stripProtocol(u: string) {
  return u.replace(/^https?:\/\//, "");
}

function safeHref(u: string) {
  if (/^https?:\/\//i.test(u)) return u;
  return `https://${u}`;
}

function displayHandle(link: SocialLink) {
  const meta = PLATFORM_META[link.platform] || null;
  let value = stripProtocol(link.url);
  if (meta?.baseUrl) {
    const base = stripProtocol(meta.baseUrl);
    value = value.replace(base, "");
  }
  if (meta?.prefix) {
    value = value.replace(meta.prefix, "");
  }
  value = value.replace(/^\//, "");
  if (value.length > 48) value = value.slice(0, 45) + "…";
  return { value, Icon: meta?.icon, color: meta?.color } as {
    value: string;
    Icon?: IconType;
    color?: string;
  };
}

export default function UserProfileSidePanel({
  open,
  currentUserId,
  userId,
  onClose,
  onChanged,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserRow | null>(null);
  const [links, setLinks] = useState<SocialLink[]>([]);
  const [connection, setConnection] = useState<ConnectionRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const [changingType, setChangingType] = useState(false);

  // new request fields
  const [description, setDescription] = useState("");
  const [year, setYear] = useState("");
  const [connectionType, setConnectionType] = useState<
    "first" | "one_point_five"
  >("first");
  const [amendMode, setAmendMode] = useState(false);

  // Encode optional year inside how_met as a suffix "(Year: YYYY)"
  function formatHowMet(desc: string, y?: string) {
    const base = (desc || "").trim();
    const yy = (y || "").trim();
    if (yy && /^\d{4}$/.test(yy)) return `${base} (Year: ${yy})`;
    return base;
  }
  function parseYearFromHowMet(how_met?: string | null) {
    if (!how_met) return "";
    const m = how_met.match(/\(\s*Year:\s*(\d{4})\s*\)\s*$/i);
    return m ? m[1] : "";
  }
  function stripYearFromHowMet(how_met?: string | null) {
    if (!how_met) return "";
    return how_met.replace(/\s*\(\s*Year:\s*\d{4}\s*\)\s*$/i, "").trim();
  }

  // no met-through input

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [profileRes, connectionRes] = await Promise.all([
          fetch(`/api/profile/${userId}`),
          fetch(
            `/api/connection?a=${encodeURIComponent(
              currentUserId
            )}&b=${encodeURIComponent(userId)}`
          ),
        ]);

        if (!profileRes.ok) {
          const j = await profileRes.json().catch(() => ({}));
          throw new Error(
            j?.error?.message || `Failed to load profile (${profileRes.status})`
          );
        }
        const pj = (await profileRes.json()) as {
          data: { user: UserRow; links: SocialLink[] } | null;
        };
        const cj = (await connectionRes.json()) as {
          data: ConnectionRow | null;
          error?: unknown;
        };
        setProfile(pj?.data?.user || null);
        setLinks(pj?.data?.links || []);
        setConnection(cj?.data || null);

        // Check block status (only if not viewing self)
        if (currentUserId !== userId) {
          const { isBlocked } = await isUserBlocked(currentUserId, userId);
          setIsBlocked(!!isBlocked);
        } else {
          setIsBlocked(false);
        }
      } catch (e) {
        setError((e as Error).message);
        setProfile(null);
        setLinks([]);
        setConnection(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, userId, currentUserId]);

  async function refresh() {
    const res = await fetch(
      `/api/connection?a=${encodeURIComponent(
        currentUserId
      )}&b=${encodeURIComponent(userId)}`
    );
    if (res.ok) {
      const j = (await res.json()) as { data: ConnectionRow | null };
      setConnection(j.data || null);
    }
  }

  async function sendRequest() {
    setError(null);

    if (!description.trim()) {
      setError("Connection description is required.");
      return;
    }

    if (year && !/^\d{4}$/.test(year)) {
      setError("Year must be a 4-digit number.");
      return;
    }

    // Check if user has reached the 100 first connection limit when sending a first connection request
    if (connectionType === "first") {
      const { count, error: countError } = await getFirstConnectionCount(
        currentUserId
      );
      if (countError) {
        setError("Failed to check connection limit. Please try again.");
        return;
      }
      if (count >= 100) {
        setError(
          "You cannot send more first connection requests. You have reached the limit of 100 first connections."
        );
        return;
      }
    }

    const { error: e } = await createConnectionRequest({
      requester_id: currentUserId,
      recipient_id: userId,
      how_met: formatHowMet(description, year),
      connection_type: connectionType,
      status: "pending",
    });
    if (e) {
      setError(e.message);
      return;
    }
    setDescription("");
    setYear("");
    setConnectionType("first");
    await refresh();
    onChanged?.();
  }

  async function accept(id: string) {
    setError(null);

    // Check if user has reached the 100 first connection limit when accepting a first connection request
    if (connection?.connection_type === "first") {
      const { count, error: countError } = await getFirstConnectionCount(
        currentUserId
      );
      if (countError) {
        setError("Failed to check connection limit. Please try again.");
        return;
      }
      if (count >= 100) {
        setError(
          "You cannot accept this first connection request. You have reached the limit of 100 first connections."
        );
        return;
      }
    }

    const { error: e } = await updateConnectionStatus(id, "accepted");
    if (e) {
      setError(e.message);
      return;
    }
    await refresh();
    onChanged?.();
  }

  async function reject(id: string) {
    setError(null);
    const { error: e } = await updateConnectionStatus(id, "rejected");
    if (e) {
      setError(e.message);
      return;
    }
    await refresh();
    onChanged?.();
  }

  async function cancel(id: string) {
    setError(null);
    const { error: e } = await deleteConnection(id);
    console.log("deleteConnection result (cancel):", { id, error });
    if (e) {
      console.error("deleteConnection error", e);
      setError(e.message);
      return;
    }
    await refresh();
    onChanged?.();
  }

  async function amendPending(id: string) {
    setError(null);
    if (year && !/^\d{4}$/.test(year)) {
      setError("Year must be a 4-digit number.");
      return;
    }
    const { error: e } = await updateConnectionRequestDetails(id, {
      how_met: formatHowMet(description || "", year),
    });
    if (e) {
      setError(e.message);
      return;
    }
    setAmendMode(false);
    await refresh();
    onChanged?.();
  }

  async function handleBlock() {
    if (isMe || blockBusy) return;
    setBlockBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockerId: currentUserId, blockedId: userId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error?.message || res.statusText);
      setIsBlocked(true);
      await refresh();
      onChanged?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBlockBusy(false);
    }
  }

  async function handleUnblock() {
    if (isMe || blockBusy) return;
    setBlockBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blockerId: currentUserId,
          blockedId: userId,
          action: "unblock",
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error?.message || res.statusText);
      setIsBlocked(false);
      await refresh();
      onChanged?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBlockBusy(false);
    }
  }

  async function handleDowngradeType() {
    if (!connection) return;
    setChangingType(true);
    setError(null);
    try {
      const { error: e } = await downgradeConnectionType(connection.id);
      if (e) throw e;
      await refresh();
      onChanged?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChangingType(false);
    }
  }

  async function handleRequestUpgrade() {
    if (!connection) return;
    setChangingType(true);
    setError(null);
    try {
      const { error: e } = await requestConnectionTypeUpgrade(
        connection.id,
        currentUserId
      );
      if (e) throw e;
      await refresh();
      onChanged?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChangingType(false);
    }
  }

  async function handleAcceptUpgrade() {
    if (!connection) return;
    setChangingType(true);
    setError(null);
    try {
      const { error: e } = await acceptConnectionTypeUpgrade(connection.id);
      if (e) throw e;
      await refresh();
      onChanged?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChangingType(false);
    }
  }

  async function handleRejectUpgrade() {
    if (!connection) return;
    setChangingType(true);
    setError(null);
    try {
      const { error: e } = await rejectConnectionTypeUpgrade(connection.id);
      if (e) throw e;
      await refresh();
      onChanged?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChangingType(false);
    }
  }

  const isMe = currentUserId === userId;
  const requesterIsMe = connection && connection.requester_id === currentUserId;

  return (
    <div
      className={`fixed inset-y-0 right-0 z-50 w-full sm:w-[480px] transform transition-transform duration-300 ${
        open ? "translate-x-0" : "translate-x-full"
      } bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 shadow-xl`}
      aria-hidden={!open}
    >
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <h3 className="text-lg font-semibold">Profile</h3>
          <button
            onClick={onClose}
            className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Close"
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {loading ? (
            <div className="text-sm text-gray-500">Loading…</div>
          ) : !profile ? (
            <div className="text-sm text-red-600">Profile not available.</div>
          ) : (
            <>
              <div className="flex items-start gap-4">
                {profile.profile_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.profile_image_url}
                    alt="Profile"
                    className="w-20 h-20 rounded-lg object-cover border border-gray-200 dark:border-gray-700"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center">
                    <span className="text-2xl font-bold text-gray-600 dark:text-gray-300">
                      {(
                        (profile.preferred_name || profile.name || "?").charAt(
                          0
                        ) || "?"
                      ).toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-xl font-bold">
                    {profile.preferred_name || profile.name}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    @{profile.username}
                  </div>
                  {profile.bio && (
                    <p className="text-sm text-gray-700 dark:text-gray-300 mt-2">
                      {profile.bio}
                    </p>
                  )}
                </div>
              </div>

              {/* Block banner */}
              {isBlocked && (
                <div className="p-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300">
                  You have blocked this user. You won&apos;t receive requests
                  from them.
                </div>
              )}

              {/* Connection status (hidden when blocked) */}
              {!isMe && !isBlocked && (
                <div className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                  <div className="font-semibold mb-2">Connection</div>
                  {!connection ? (
                    <div className="space-y-3">
                      <div className="text-sm text-gray-600">Not connected</div>
                      <div className="grid grid-cols-1 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">
                            Connection Type
                          </label>
                          <select
                            className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                            value={connectionType}
                            onChange={(e) =>
                              setConnectionType(
                                e.target.value as "first" | "one_point_five"
                              )
                            }
                          >
                            <option value="first">1st Connection</option>
                            <option value="one_point_five">
                              1.5 Connection
                            </option>
                          </select>
                          <p className="text-xs text-gray-500 mt-1">
                            {connectionType === "first"
                              ? "Limited to 100 per user. For your closest connections."
                              : "For connections who are important but not in your inner circle."}
                          </p>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">
                            Connection Description
                          </label>
                          <input
                            className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="How you met and relationship"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">
                            Year (optional)
                          </label>
                          <input
                            className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                            value={year}
                            onChange={(e) => setYear(e.target.value)}
                            placeholder="e.g., 2023"
                          />
                        </div>
                        {null}
                      </div>
                      <button
                        className="w-full py-2 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium"
                        onClick={sendRequest}
                      >
                        Send Request
                      </button>
                      {error && (
                        <div className="text-sm text-red-600">{error}</div>
                      )}
                    </div>
                  ) : connection.status === "accepted" ? (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="inline-flex items-center gap-2 px-2 py-1 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 text-sm font-medium">
                          <span className="w-2 h-2 rounded-full bg-green-600"></span>
                          Connected
                        </div>
                        {connection.connection_type && (
                          <div
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                              connection.connection_type === "first"
                                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                                : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                            }`}
                          >
                            {connection.connection_type === "first"
                              ? "1st"
                              : "1.5"}
                          </div>
                        )}
                      </div>

                      {/* Show upgrade request status if exists */}
                      {connection.upgrade_requested_type && (
                        <div className="mt-2 p-2 rounded bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
                          {connection.upgrade_requested_by === currentUserId ? (
                            <div className="text-xs text-yellow-800 dark:text-yellow-200">
                              <div className="font-medium">
                                Upgrade to 1st connection requested
                              </div>
                              <div className="mt-1">
                                Waiting for approval...
                              </div>
                            </div>
                          ) : (
                            <div className="text-xs text-yellow-800 dark:text-yellow-200">
                              <div className="font-medium">
                                Upgrade request received
                              </div>
                              <div className="mt-1">
                                Wants to upgrade to 1st connection
                              </div>
                              <div className="mt-2 flex gap-2">
                                <button
                                  onClick={handleAcceptUpgrade}
                                  disabled={changingType}
                                  className="flex-1 px-2 py-1 rounded bg-green-600 text-white text-xs hover:bg-green-700 disabled:opacity-50"
                                >
                                  Accept
                                </button>
                                <button
                                  onClick={handleRejectUpgrade}
                                  disabled={changingType}
                                  className="flex-1 px-2 py-1 rounded bg-red-600 text-white text-xs hover:bg-red-700 disabled:opacity-50"
                                >
                                  Decline
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="text-sm text-gray-700 dark:text-gray-300">
                        {stripYearFromHowMet(connection.how_met)}
                        {parseYearFromHowMet(connection.how_met) && (
                          <>
                            {" • "}Year:{" "}
                            {parseYearFromHowMet(connection.how_met)}
                          </>
                        )}
                        {connection.met_through?.username ? (
                          <>
                            {" • "}met through @
                            {connection.met_through.username}
                          </>
                        ) : null}
                      </div>

                      {/* Connection type management - only show if no pending upgrade */}
                      {!connection.upgrade_requested_type && (
                        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                            Manage Connection Type
                          </div>
                          {connection.connection_type === "first" ? (
                            <button
                              onClick={handleDowngradeType}
                              disabled={changingType}
                              className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
                            >
                              Downgrade to 1.5 Connection
                            </button>
                          ) : (
                            <button
                              onClick={handleRequestUpgrade}
                              disabled={changingType}
                              className="w-full px-3 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50"
                            >
                              Request Upgrade to 1st
                            </button>
                          )}
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {connection.connection_type === "first"
                              ? "Downgrade does not require approval"
                              : "Upgrade requires approval from the other person"}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : connection.status === "pending" ? (
                    <div className="space-y-2">
                      {requesterIsMe ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                            <span className="inline-flex items-center gap-2 px-2 py-1 rounded bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 font-medium">
                              <span className="w-2 h-2 rounded-full bg-yellow-500" />
                              Pending
                            </span>
                            <span>— awaiting response</span>
                          </div>

                          {/* Current request summary */}
                          <div className="text-sm text-gray-700 dark:text-gray-300">
                            <div>
                              <span className="text-gray-500">
                                Description:
                              </span>{" "}
                              {stripYearFromHowMet(connection.how_met) || "—"}
                            </div>
                            {(parseYearFromHowMet(connection.how_met) ||
                              connection.met_through) && (
                              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                                {parseYearFromHowMet(connection.how_met) && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-xs text-gray-700 dark:text-gray-200">
                                    Year:{" "}
                                    {parseYearFromHowMet(connection.how_met)}
                                  </span>
                                )}
                                {connection.met_through && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-xs text-gray-700 dark:text-gray-200">
                                    Met through @
                                    {connection.met_through.username}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Amend form toggle */}
                          {amendMode ? (
                            <div className="mt-2 space-y-3">
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">
                                  Connection Description
                                </label>
                                <input
                                  className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                                  value={description}
                                  onChange={(e) =>
                                    setDescription(e.target.value)
                                  }
                                  placeholder="How you met and relationship"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">
                                  Year (optional)
                                </label>
                                <input
                                  className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                                  value={year}
                                  onChange={(e) => setYear(e.target.value)}
                                  placeholder="e.g., 2023"
                                />
                              </div>
                              {null}

                              <div className="flex gap-2">
                                <button
                                  className="flex-1 px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
                                  onClick={() => amendPending(connection.id)}
                                >
                                  Save changes
                                </button>
                                <button
                                  className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
                                  onClick={() => {
                                    setAmendMode(false);
                                    setError(null);
                                  }}
                                >
                                  Cancel
                                </button>
                              </div>
                              {error && (
                                <div className="text-sm text-red-600">
                                  {error}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <button
                                className="flex-1 px-3 py-2 rounded bg-gray-600 text-white hover:bg-gray-700"
                                onClick={() => cancel(connection.id)}
                              >
                                Cancel request
                              </button>
                              <button
                                className="flex-1 px-3 py-2 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
                                onClick={() => {
                                  // Prefill fields from current connection when entering amend mode
                                  setDescription(
                                    stripYearFromHowMet(connection.how_met)
                                  );
                                  setYear(
                                    parseYearFromHowMet(connection.how_met)
                                  );
                                  setAmendMode(true);
                                }}
                              >
                                Amend
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-sm text-gray-700 dark:text-gray-300">
                          {connection.requester?.preferred_name ||
                            connection.requester?.name}{" "}
                          sent you a request
                        </div>
                      )}
                      {!requesterIsMe && (
                        <div className="flex gap-2">
                          <button
                            className="flex-1 px-3 py-2 rounded bg-green-600 text-white hover:bg-green-700"
                            onClick={() => accept(connection.id)}
                          >
                            Accept
                          </button>
                          <button
                            className="flex-1 px-3 py-2 rounded bg-red-600 text-white hover:bg-red-700"
                            onClick={() => reject(connection.id)}
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-600">
                      Last status: {connection.status}
                    </div>
                  )}
                </div>
              )}

              {/* Actions: Block/Unblock */}
              {!isMe && (
                <div className="flex gap-2">
                  {isBlocked ? (
                    <button
                      onClick={handleUnblock}
                      disabled={blockBusy}
                      className="flex-1 px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                    >
                      Unblock User
                    </button>
                  ) : (
                    <button
                      onClick={handleBlock}
                      disabled={blockBusy}
                      className="flex-1 px-3 py-2 rounded border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-60"
                    >
                      Block User
                    </button>
                  )}
                </div>
              )}

              {/* Social links */}
              {links.length > 0 && (
                <div className="p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                  <div className="font-semibold mb-3">Social Links</div>
                  <div className="space-y-2">
                    {links.map((l) => {
                      const { value, Icon, color } = displayHandle(l);
                      const href = safeHref(l.url);
                      return (
                        <a
                          key={l.id}
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          className="group flex items-center justify-between px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {Icon ? (
                              <Icon
                                className={`text-lg ${
                                  color || "text-gray-500"
                                }`}
                              />
                            ) : (
                              <div className="w-4 h-4 rounded bg-gray-300" />
                            )}
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                {l.platform}
                              </div>
                              <div className="text-xs text-gray-600 dark:text-gray-400 truncate">
                                {value || stripProtocol(l.url)}
                              </div>
                            </div>
                          </div>
                          <FiExternalLink className="shrink-0 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300" />
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
