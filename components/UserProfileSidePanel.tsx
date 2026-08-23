"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createConnectionRequest,
  updateConnectionStatus,
  deleteConnection,
  updateConnectionRequestDetails,
  isUserBlocked,
  getFirstConnectionCount,
  requestConnectionTypeUpgrade,
  cancelConnectionTypeUpgradeRequest,
  downgradeConnectionType,
  acceptConnectionTypeUpgrade,
  rejectConnectionTypeUpgrade,
  removeConnection,
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
import { X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { SkeletonAvatar, SkeletonText } from "@/components/ui/Skeleton";
import { getVerifiedSocialRows } from "@/lib/social-links";

type Props = {
  open: boolean;
  currentUserId: string;
  userId: string;
  onClose: () => void;
  onChanged?: () => void;
};

type UserRow = Database["public"]["Tables"]["users"]["Row"];
type SocialLink = Database["public"]["Tables"]["social_links"]["Row"];
type SocialVerification = {
  provider: string;
  provider_account_id: string;
  display_name: string | null;
  profile_url: string | null;
};
type ConnectionRow = Database["public"]["Tables"]["connections"]["Row"] & {
  requester: {
    id: string;
    name: string;
    preferred_name: string | null;
    profile_image_url: string | null;
  };
  recipient: {
    id: string;
    name: string;
    preferred_name: string | null;
    profile_image_url: string | null;
  };
};

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
  Discord: { icon: FaDiscord, color: "text-indigo-600" },
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
  if (meta?.baseUrl) value = value.replace(stripProtocol(meta.baseUrl), "");
  if (meta?.prefix) value = value.replace(meta.prefix, "");
  value = value.replace(/^\//, "");
  if (value.length > 48) value = value.slice(0, 45) + "…";
  return { value, Icon: meta?.icon, color: meta?.color } as {
    value: string;
    Icon?: IconType;
    color?: string;
  };
}

function displaySocialRow(row: {
  platform: string;
  url: string | null;
  label?: string;
}) {
  const meta = PLATFORM_META[row.platform] || null;
  const rawValue = row.url || row.label || "";
  let value = row.url ? stripProtocol(row.url) : rawValue;
  if (meta?.baseUrl) value = value.replace(stripProtocol(meta.baseUrl), "");
  if (meta?.prefix) value = value.replace(meta.prefix, "");
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
  const [socialVerifications, setSocialVerifications] = useState<
    SocialVerification[]
  >([]);
  const [connection, setConnection] = useState<ConnectionRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const [changingType, setChangingType] = useState(false);

  const [description, setDescription] = useState("");
  const [year, setYear] = useState("");
  const [connectionType, setConnectionType] = useState<
    "first" | "one_point_five"
  >("first");
  const [amendMode, setAmendMode] = useState(false);
  const [sidebarSection, setSidebarSection] = useState<
    "connection" | "socials"
  >("connection");

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

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [profileRes, connectionRes] = await Promise.all([
          fetch(`/api/profile/${userId}`),
          fetch(
            `/api/connection?a=${encodeURIComponent(currentUserId)}&b=${encodeURIComponent(userId)}`,
          ),
        ]);
        if (!profileRes.ok) {
          const j = await profileRes.json().catch(() => ({}));
          throw new Error(
            j?.error?.message ||
              `Failed to load profile (${profileRes.status})`,
          );
        }
        const pj = (await profileRes.json()) as {
          data: {
            user: UserRow;
            links: SocialLink[];
            verifications?: SocialVerification[];
          } | null;
        };
        const cj = (await connectionRes.json()) as {
          data: ConnectionRow | null;
          error?: unknown;
        };
        setProfile(pj?.data?.user || null);
        setLinks(pj?.data?.links || []);
        setSocialVerifications(pj?.data?.verifications || []);
        setConnection(cj?.data || null);
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
        setSocialVerifications([]);
        setConnection(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, userId, currentUserId]);

  async function refresh() {
    const res = await fetch(
      `/api/connection?a=${encodeURIComponent(currentUserId)}&b=${encodeURIComponent(userId)}`,
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
    if (connectionType === "first") {
      const { count, error: countError } =
        await getFirstConnectionCount(currentUserId);
      if (countError) {
        setError("Failed to check connection limit. Please try again.");
        return;
      }
      if (count >= 100) {
        setError("You have reached the limit of 100 first connections.");
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
    if (connection?.connection_type === "first") {
      const { count, error: countError } =
        await getFirstConnectionCount(currentUserId);
      if (countError) {
        setError("Failed to check connection limit. Please try again.");
        return;
      }
      if (count >= 100) {
        setError("You have reached the limit of 100 first connections.");
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
    if (
      connection?.connection_type === "one_point_five" &&
      connectionType === "first"
    ) {
      const { count, error: countError } =
        await getFirstConnectionCount(currentUserId);
      if (countError) {
        setError("Failed to check connection limit. Please try again.");
        return;
      }
      if (count >= 100) {
        setError("You have reached the limit of 100 first connections.");
        return;
      }
    }
    const { error: e } = await updateConnectionRequestDetails(id, {
      how_met: formatHowMet(description || "", year),
      connection_type: connectionType,
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
    if (
      !confirm(
        "Block this user? They won't be able to send you connection requests.",
      )
    )
      return;
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
        currentUserId,
      );
      if (e) {
        setError(e.message);
        return;
      }
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

  async function handleCancelUpgradeRequest() {
    if (!connection) return;
    setChangingType(true);
    setError(null);
    try {
      const { error: e } = await cancelConnectionTypeUpgradeRequest(
        connection.id,
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

  async function handleRemoveConnection() {
    if (!connection) return;
    if (!confirm("Remove this connection? This cannot be undone.")) return;
    setChangingType(true);
    setError(null);
    try {
      const { error: e } = await removeConnection(connection.id);
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
  const socialRows = useMemo(
    () =>
      getVerifiedSocialRows({
        links,
        verifications: socialVerifications,
      }),
    [links, socialVerifications],
  );
  const allLinkedSocialRows = useMemo(
    () => [
      ...links.map((link) => ({
        id: link.id,
        platform: link.platform,
        label: displayHandle(link).value,
        url: link.url,
        verified: false,
      })),
      ...socialRows.map((row) => ({
        id: `verified-${row.platform}`,
        ...row,
      })),
    ],
    [links, socialRows],
  );

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
          <h3 className="text-sm font-semibold">Profile</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {loading ? (
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <SkeletonAvatar size="lg" />
                <div className="flex-1 space-y-2 mt-1">
                  <SkeletonText className="w-1/2" />
                  <SkeletonText className="w-1/3" />
                  <SkeletonText className="w-3/4" />
                </div>
              </div>
              <SkeletonText className="w-full" />
              <SkeletonText className="w-2/3" />
            </div>
          ) : !profile ? (
            <p className="text-sm text-red-600 dark:text-red-400">
              {error || "Profile not available."}
            </p>
          ) : (
            <>
              {/* Profile header */}
              <div className="flex items-start gap-4">
                <Avatar
                  size="lg"
                  name={profile.name || ""}
                  imageUrl={profile.profile_image_url}
                  className="flex-shrink-0"
                />
                <div className="min-w-0">
                  <div className="text-lg font-semibold">
                    {profile.preferred_name || profile.name}
                  </div>
                  {profile.bio && (
                    <p className="text-sm text-gray-700 dark:text-gray-300 mt-2 leading-snug">
                      {profile.bio}
                    </p>
                  )}
                </div>
              </div>

              <div className="border-b border-gray-200 dark:border-gray-800">
                <div className="flex items-center gap-6">
                  <button
                    type="button"
                    onClick={() => setSidebarSection("connection")}
                    className={[
                      "border-b-2 px-1 pb-2 text-xs font-semibold uppercase tracking-[0.14em] transition-colors",
                      sidebarSection === "connection"
                        ? "border-gray-900 text-gray-900 dark:border-gray-100 dark:text-gray-100"
                        : "border-transparent text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300",
                    ].join(" ")}
                  >
                    Connection
                  </button>
                  <button
                    type="button"
                    onClick={() => setSidebarSection("socials")}
                    className={[
                      "border-b-2 px-1 pb-2 text-xs font-semibold uppercase tracking-[0.14em] transition-colors",
                      sidebarSection === "socials"
                        ? "border-gray-900 text-gray-900 dark:border-gray-100 dark:text-gray-100"
                        : "border-transparent text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300",
                    ].join(" ")}
                  >
                    Socials
                  </button>
                </div>
              </div>

              {sidebarSection === "socials" && (
                <Card>
                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                    Socials
                  </div>
                  {allLinkedSocialRows.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      No socials linked yet.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {allLinkedSocialRows.map((row) => {
                        const { value, Icon, color } = displaySocialRow(row);
                        const content = (
                          <>
                            <div className="flex items-center gap-3 min-w-0">
                              {Icon ? (
                                <Icon
                                  className={`text-lg flex-shrink-0 ${
                                    color || "text-gray-500"
                                  }`}
                                />
                              ) : (
                                <div className="w-4 h-4 rounded bg-gray-300 flex-shrink-0" />
                              )}
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                  {row.platform}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                  {value || row.label}
                                </div>
                              </div>
                            </div>
                            {row.url ? (
                              <FiExternalLink className="flex-shrink-0 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300" />
                            ) : null}
                          </>
                        );

                        return row.url ? (
                          <a
                            key={row.id}
                            href={safeHref(row.url)}
                            target="_blank"
                            rel="noreferrer"
                            className="group flex items-center justify-between px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                          >
                            {content}
                          </a>
                        ) : (
                          <div
                            key={row.id}
                            className="flex items-center justify-between px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50"
                          >
                            {content}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              )}

              {sidebarSection === "connection" && (
                <>
                  {/* Block banner */}
                  {isBlocked && (
                    <div className="p-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300">
                      You have blocked this user. They won&apos;t be able to
                      send you connection requests.
                    </div>
                  )}

                  {/* Inline error */}
                  {error && (
                    <p className="text-sm text-red-600 dark:text-red-400">
                      {error}
                    </p>
                  )}

                  {/* Connection status */}
                  {!isMe && !isBlocked && (
                    <Card>
                      {!connection ? (
                        <div className="space-y-3">
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            Not connected
                          </p>
                          <Select
                            label="Connection Type"
                            value={connectionType}
                            onChange={(e) =>
                              setConnectionType(
                                e.target.value as "first" | "one_point_five",
                              )
                            }
                          >
                            <option value="first">1st Connection</option>
                            <option value="one_point_five">
                              1.5 Connection
                            </option>
                          </Select>
                          <p className="text-xs text-gray-500 -mt-1">
                            {connectionType === "first"
                              ? "Limited to 100. For your closest connections."
                              : "For connections not in your inner circle."}
                          </p>
                          <Input
                            label="Connection Description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="How you met and relationship"
                          />
                          <Input
                            label="Year (optional)"
                            value={year}
                            onChange={(e) => setYear(e.target.value)}
                            placeholder="e.g., 2023"
                          />
                          <Button
                            variant="primary"
                            size="md"
                            className="w-full"
                            onClick={sendRequest}
                          >
                            Send Request
                          </Button>
                        </div>
                      ) : connection.status === "accepted" ? (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 text-xs font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-600" />
                              Connected
                            </span>
                            {connection.connection_type && (
                              <Badge
                                variant={
                                  connection.connection_type === "first"
                                    ? "first"
                                    : "onePointFive"
                                }
                              />
                            )}
                          </div>

                          {/* Upgrade request status */}
                          {connection.upgrade_requested_type && (
                            <div className="p-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10">
                              {connection.upgrade_requested_by ===
                              currentUserId ? (
                                <div className="space-y-2">
                                  <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
                                    Upgrade to 1st connection requested
                                  </p>
                                  <p className="text-xs text-amber-700 dark:text-amber-300">
                                    Waiting for approval...
                                  </p>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    className="w-full"
                                    onClick={handleCancelUpgradeRequest}
                                    disabled={changingType}
                                  >
                                    Cancel Request
                                  </Button>
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
                                    Upgrade request received
                                  </p>
                                  <p className="text-xs text-amber-700 dark:text-amber-300">
                                    Wants to upgrade to 1st connection
                                  </p>
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      variant="primary"
                                      className="flex-1"
                                      onClick={handleAcceptUpgrade}
                                      disabled={changingType}
                                    >
                                      Accept
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      className="flex-1"
                                      onClick={handleRejectUpgrade}
                                      disabled={changingType}
                                    >
                                      Decline
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          <p className="text-sm text-gray-700 dark:text-gray-300">
                            {stripYearFromHowMet(connection.how_met)}
                            {parseYearFromHowMet(connection.how_met) && (
                              <span className="text-gray-500">
                                {" "}
                                · {parseYearFromHowMet(connection.how_met)}
                              </span>
                            )}
                          </p>

                          {/* Manage connection type */}
                          {!connection.upgrade_requested_type && (
                            <div className="pt-3 border-t border-gray-200 dark:border-gray-700 space-y-1.5">
                              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                Manage Connection Type
                              </p>
                              {connection.connection_type === "first" ? (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="w-full"
                                  onClick={handleDowngradeType}
                                  disabled={changingType}
                                >
                                  Downgrade to 1.5 Connection
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="primary"
                                  className="w-full"
                                  onClick={handleRequestUpgrade}
                                  disabled={changingType}
                                >
                                  Request Upgrade to 1st
                                </Button>
                              )}
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {connection.connection_type === "first"
                                  ? "Downgrade does not require approval"
                                  : "Upgrade requires approval from the other person"}
                              </p>
                            </div>
                          )}

                          {/* Remove connection */}
                          <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                            <Button
                              size="sm"
                              variant="destructive"
                              className="w-full"
                              onClick={handleRemoveConnection}
                              disabled={changingType}
                            >
                              Remove Connection
                            </Button>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              Remove this connection completely
                            </p>
                          </div>
                        </div>
                      ) : connection.status === "pending" ? (
                        <div className="space-y-3">
                          {requesterIsMe ? (
                            <>
                              <div className="flex items-center gap-2 text-sm">
                                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 text-xs font-medium">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                  Pending
                                </span>
                                <span className="text-gray-500 text-xs">
                                  — awaiting response
                                </span>
                              </div>
                              <div className="text-sm text-gray-700 dark:text-gray-300">
                                <span className="text-gray-500">
                                  Description:{" "}
                                </span>
                                {stripYearFromHowMet(connection.how_met) || "—"}
                              </div>

                              {amendMode ? (
                                <div className="space-y-3">
                                  <Select
                                    label="Connection Type"
                                    value={connectionType}
                                    onChange={(e) =>
                                      setConnectionType(
                                        e.target.value as
                                          | "first"
                                          | "one_point_five",
                                      )
                                    }
                                  >
                                    <option value="first">
                                      1st Connection
                                    </option>
                                    <option value="one_point_five">
                                      1.5 Connection
                                    </option>
                                  </Select>
                                  <Input
                                    label="Connection Description"
                                    value={description}
                                    onChange={(e) =>
                                      setDescription(e.target.value)
                                    }
                                    placeholder="How you met and relationship"
                                  />
                                  <Input
                                    label="Year (optional)"
                                    value={year}
                                    onChange={(e) => setYear(e.target.value)}
                                    placeholder="e.g., 2023"
                                  />
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      variant="primary"
                                      className="flex-1"
                                      onClick={() =>
                                        amendPending(connection.id)
                                      }
                                    >
                                      Save changes
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      onClick={() => {
                                        setAmendMode(false);
                                        setError(null);
                                      }}
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    className="flex-1"
                                    onClick={() => cancel(connection.id)}
                                  >
                                    Cancel request
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="flex-1"
                                    onClick={() => {
                                      setDescription(
                                        stripYearFromHowMet(connection.how_met),
                                      );
                                      setYear(
                                        parseYearFromHowMet(connection.how_met),
                                      );
                                      setConnectionType(
                                        (connection.connection_type ||
                                          "first") as
                                          | "first"
                                          | "one_point_five",
                                      );
                                      setAmendMode(true);
                                    }}
                                  >
                                    Amend
                                  </Button>
                                </div>
                              )}
                            </>
                          ) : (
                            <>
                              <p className="text-sm text-gray-700 dark:text-gray-300">
                                {connection.requester?.preferred_name ||
                                  connection.requester?.name}{" "}
                                sent you a request
                              </p>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="primary"
                                  className="flex-1"
                                  onClick={() => accept(connection.id)}
                                >
                                  Accept
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="flex-1"
                                  onClick={() => reject(connection.id)}
                                >
                                  Reject
                                </Button>
                              </div>
                            </>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">
                          Last status: {connection.status}
                        </p>
                      )}
                    </Card>
                  )}

                  {/* Block / Unblock */}
                  {!isMe && (
                    <div>
                      {isBlocked ? (
                        <Button
                          variant="primary"
                          size="sm"
                          className="w-full"
                          onClick={handleUnblock}
                          disabled={blockBusy}
                        >
                          Unblock User
                        </Button>
                      ) : (
                        <Button
                          variant="destructive"
                          size="sm"
                          className="w-full"
                          onClick={handleBlock}
                          disabled={blockBusy}
                        >
                          Block User
                        </Button>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
