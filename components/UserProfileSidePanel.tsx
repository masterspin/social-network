"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createConnectionRequest,
  updateConnectionStatus,
  deleteConnection,
  isUserBlocked,
  removeConnection,
} from "@/lib/api/queries";
import type {
  ConnectionRow as BaseConnectionRow,
  SocialLinkRow,
  UserRow,
} from "@/types/db";
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
import { Check, MoreHorizontal, Pencil, X } from "lucide-react";
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
  onShortestPath?: (path: {
    nodes: Array<{
      id: string;
      name: string;
      preferred_name: string | null;
      profile_image_url: string | null;
    }>;
    links: ShortestPathLink[];
  }) => void;
  refreshNonce?: number;
};

type SocialLink = SocialLinkRow;
type SocialVerification = {
  provider: string;
  provider_account_id: string;
  display_name: string | null;
  profile_url: string | null;
};
type PrivateConnectionNote = {
  id: string;
  connection_id: string;
  user_id: string;
  description: string | null;
  year: string | null;
  connection_type: "first" | "one_point_five" | null;
};
type ShortestPathUser = {
  id: string;
  name?: string | null;
  preferred_name?: string | null;
  profile_image_url?: string | null;
};
type ShortestPathLink = {
  source: string;
  target: string;
  connection_type?: string | null;
};
type ConnectionRow = BaseConnectionRow & {
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
  onShortestPath,
  refreshNonce = 0,
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
  const [noteBusy, setNoteBusy] = useState(false);
  const [pathLoading, setPathLoading] = useState(false);
  const [shortestPath, setShortestPath] = useState<ShortestPathUser[] | null>(
    null,
  );
  const [pathChecked, setPathChecked] = useState(false);

  const [description, setDescription] = useState("");
  const [year, setYear] = useState("");
  const [privateNote, setPrivateNote] = useState<PrivateConnectionNote | null>(
    null,
  );
  const [noteEditMode, setNoteEditMode] = useState(false);
  const [connectionType, setConnectionType] = useState<
    "first" | "one_point_five"
  >("one_point_five");
  const [actionsOpen, setActionsOpen] = useState(false);
  const [sidebarSection, setSidebarSection] = useState<
    "connection" | "socials"
  >("connection");

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      setError(null);
      setShortestPath(null);
      setPathChecked(false);
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
        if (cj?.data?.id) {
          await loadPrivateNote(cj.data.id);
        } else {
          setPrivateNote(null);
          setDescription("");
          setYear("");
          setNoteEditMode(false);
        }
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
        setPrivateNote(null);
        setNoteEditMode(false);
        setShortestPath(null);
        setPathChecked(false);
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
      if (j.data?.id) await loadPrivateNote(j.data.id);
    }
  }

  async function viewShortestPath() {
    setPathLoading(true);
    setPathChecked(false);
    setShortestPath(null);
    setError(null);

    try {
      const res = await fetch(
        `/api/network/shortest-path?source=${encodeURIComponent(currentUserId)}&target=${encodeURIComponent(userId)}`,
      );
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error?.message || "Failed to find path");
      }
      const path = (payload?.data?.path || null) as ShortestPathUser[] | null;
      setShortestPath(path);
      setPathChecked(true);
      if (path) {
        onShortestPath?.({
          nodes: path.map((pathUser) => ({
            id: pathUser.id,
            name: pathUser.name || "",
            preferred_name: pathUser.preferred_name ?? null,
            profile_image_url: pathUser.profile_image_url ?? null,
          })),
          links: (payload?.data?.links || []) as ShortestPathLink[],
        });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPathLoading(false);
    }
  }

  useEffect(() => {
    if (!open || refreshNonce === 0) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, refreshNonce]);

  async function loadPrivateNote(connectionId: string) {
    const res = await fetch(
      `/api/connection-notes?connectionId=${encodeURIComponent(connectionId)}&userId=${encodeURIComponent(currentUserId)}`,
    );
    if (!res.ok) return;
    const payload = (await res.json()) as {
      data: PrivateConnectionNote | null;
    };
    setPrivateNote(payload.data);
    setDescription(payload.data?.description || "");
    setYear(payload.data?.year || "");
    setConnectionType(payload.data?.connection_type || "one_point_five");
    setNoteEditMode(false);
  }

  async function saveConnectionNote(connectionId = connection?.id) {
    if (!connectionId) return;
    if (year && !/^\d{4}$/.test(year)) {
      setError("Year must be a 4-digit number.");
      return;
    }
    setNoteBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/connection-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId,
          userId: currentUserId,
          description,
          year,
          connection_type: connectionType,
        }),
      });
      const payload = (await res.json()) as {
        data?: PrivateConnectionNote | null;
        error?: { message?: string };
      };
      if (!res.ok) throw new Error(payload.error?.message || "Failed to save");
      setPrivateNote(payload.data || null);
      setNoteEditMode(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setNoteBusy(false);
    }
  }

  function cancelNoteEdit() {
    setDescription(privateNote?.description || "");
    setYear(privateNote?.year || "");
    setConnectionType(privateNote?.connection_type || "one_point_five");
    setError(null);
    setNoteEditMode(false);
  }

  function closeActions() {
    setActionsOpen(false);
  }

  function renderActionsMenu() {
    if (isMe) return null;

    return (
      <div className="relative">
        <button
          type="button"
          aria-label="Connection actions"
          title="Connection actions"
          onClick={() => setActionsOpen((value) => !value)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
        {actionsOpen && (
          <div className="absolute right-0 top-9 z-50 min-w-44 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 text-sm shadow-lg dark:border-gray-700 dark:bg-gray-900">
            {connection?.status === "accepted" && (
              <button
                type="button"
                onClick={() => {
                  closeActions();
                  void handleRemoveConnection();
                }}
                disabled={changingType}
                className="block w-full px-3 py-2 text-left text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-950/30"
              >
                Remove
              </button>
            )}
            {isBlocked ? (
              <button
                type="button"
                onClick={() => {
                  closeActions();
                  void handleUnblock();
                }}
                disabled={blockBusy}
                className="block w-full px-3 py-2 text-left text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Unblock User
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  closeActions();
                  void handleBlock();
                }}
                disabled={blockBusy}
                className="block w-full px-3 py-2 text-left text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-950/30"
              >
                Block User
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderPrivateNote(connectionId = connection?.id) {
    const noteDescription = privateNote?.description?.trim();
    const noteYear = privateNote?.year?.trim();

    return (
      <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-800/50">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Private note
            </div>
            {!noteEditMode && (
              <div className="mt-1 space-y-0.5 text-sm">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {connectionType === "first" ? "Strong" : "Weak"}
                </p>
                {noteDescription && (
                  <p className="truncate text-gray-900 dark:text-gray-100">
                    {noteDescription}
                  </p>
                )}
                {noteYear && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {noteYear}
                  </p>
                )}
              </div>
            )}
          </div>
          {!noteEditMode && (
            <button
              type="button"
              aria-label="Edit private note"
              title="Edit private note"
              onClick={() => setNoteEditMode(true)}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
        </div>

        {noteEditMode && (
          <div className="mt-3 space-y-2">
            <Select
              label="Connection Type"
              value={connectionType}
              onChange={(e) =>
                setConnectionType(e.target.value as "first" | "one_point_five")
              }
            >
              <option value="first">Strong (family, friends)</option>
              <option value="one_point_five">
                Weak (acquaintance, coworker, schoolmate)
              </option>
            </Select>
            <Input
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="How you know them"
            />
            <Input
              label="Year (optional)"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              placeholder="e.g., 2023"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                aria-label="Cancel note edit"
                title="Cancel"
                onClick={cancelNoteEdit}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Save private note"
                title="Save private note"
                onClick={() => saveConnectionNote(connectionId)}
                disabled={noteBusy}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
              >
                <Check className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderShortestPathCard() {
    if (isMe) return null;

    return (
      <div>
        <div className="flex items-center justify-between gap-3">
          <Button
            size="sm"
            variant="secondary"
            onClick={viewShortestPath}
            disabled={pathLoading}
          >
            {pathLoading ? "Finding..." : "View shortest path"}
          </Button>
        </div>
        {pathChecked && !shortestPath && (
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            No path exists.
          </p>
        )}
        {pathChecked && shortestPath && (
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            {Math.max(shortestPath.length - 1, 0)}{" "}
            {shortestPath.length === 2 ? "step" : "steps"} away.
          </p>
        )}
      </div>
    );
  }

  async function sendRequest() {
    setError(null);
    if (year && !/^\d{4}$/.test(year)) {
      setError("Year must be a 4-digit number.");
      return;
    }
    const { data, error: e } = await createConnectionRequest({
      requester_id: currentUserId,
      recipient_id: userId,
      how_met: "Private note",
      status: "pending",
    });
    if (e) {
      await refresh();
      onChanged?.();
      setError(e.message);
      return;
    }
    const connectionId = (data as { id?: string } | null)?.id;
    if (connectionId) await saveConnectionNote(connectionId);
    setDescription("");
    setYear("");
    setConnectionType("one_point_five");
    await refresh();
    onChanged?.();
  }

  async function accept(id: string) {
    setError(null);
    const { error: e } = await updateConnectionStatus(id, "accepted");
    if (e) {
      setError((e as Error).message);
      return;
    }
    await refresh();
    onChanged?.();
  }

  async function reject(id: string) {
    setError(null);
    const { error: e } = await updateConnectionStatus(id, "rejected");
    if (e) {
      setError((e as Error).message);
      return;
    }
    await refresh();
    onChanged?.();
  }

  async function cancel(id: string) {
    setError(null);
    const { error: e } = await deleteConnection(id);
    console.log("deleteConnection result (cancel):", { id, error: e });
    if (e) {
      console.error("deleteConnection error", e);
      setError((e as Error).message);
      return;
    }
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
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 truncate text-lg font-semibold">
                      {profile.preferred_name || profile.name}
                    </div>
                    <div className="ml-auto">{renderActionsMenu()}</div>
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
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
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
	                      {!connection || connection.status === "rejected" ? (
	                        <div className="space-y-3">
	                          <Input
	                            label="Description"
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
	                          {renderPrivateNote()}
	                        </div>
	                      ) : connection.status === "pending" ? (
	                        <div className="space-y-3">
	                          {requesterIsMe ? (
	                            <>
	                              <div className="flex items-center gap-2 text-sm">
	                                <Badge variant="pending">
	                                  Pending
	                                </Badge>
	                                <span className="text-gray-500 text-xs">
	                                  — awaiting response
	                                </span>
	                              </div>
	                              <Button
	                                size="sm"
	                                variant="secondary"
	                                className="w-full"
	                                onClick={() => cancel(connection.id)}
	                              >
	                                Cancel request
	                              </Button>
	                            </>
	                          ) : (
	                            <>
	                              <div className="flex items-center gap-2">
	                                <Badge variant="pending">
	                                  Pending
	                                </Badge>
	                              </div>
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
                  {renderShortestPathCard()}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
