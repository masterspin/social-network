"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { signIn, signOut as nextAuthSignOut } from "next-auth/react";
import {
  getCurrentUser,
  getUserProfile,
  updateUserProfile,
  getUserConnections,
  getUserSocialLinks,
  addSocialLink,
  deleteSocialLink,
  getBlockedUsers,
  unblockUser,
} from "@/lib/api/queries";
import type { SocialLinkRow, UserRow } from "@/types/db";
import ConnectionManager from "./ConnectionManager";
import UserProfileSidePanel from "./UserProfileSidePanel";
import Inbox from "./Inbox";
import {
  FaInstagram,
  FaTwitter,
  FaLinkedin,
  FaFacebook,
  FaTiktok,
  FaDiscord,
  FaSnapchat,
} from "react-icons/fa";
import {
  Check,
  Network,
  Inbox as InboxIcon,
  User,
  Search,
  LogOut,
  Pencil,
  Unlink,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Badge, connectionTypeBadge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import {
  getInitialDashboardTab,
  getSocialLinkEntryMode,
  getVerifiedSocialRows,
  VERIFIABLE_SOCIAL_PROVIDERS,
} from "@/lib/social-links";

const NetworkGraph = dynamic(() => import("./NetworkGraph"), {
  ssr: false,
  loading: () => (
    <div className="flex flex-1 items-center justify-center gap-3 bg-slate-950 text-slate-300">
      <Spinner size="lg" className="border-slate-600 border-t-slate-300" />
      <span className="text-sm">Loading network...</span>
    </div>
  ),
});

type UserProfile = UserRow;
type SocialLink = SocialLinkRow;
type SocialVerification = {
  provider: string;
  provider_account_id: string;
  display_name: string | null;
  avatar_url: string | null;
  profile_url: string | null;
  email: string | null;
  verified_at: string | null;
};

type SelectedConnectionUser = {
  id: string;
  name: string;
  preferred_name: string | null;
  profile_image_url: string | null;
};

type NetworkPathFilter = {
  nodes: SelectedConnectionUser[];
  links: Array<{
    source: string;
    target: string;
    connection_type?: string | null;
  }>;
};

interface PlatformConfig {
  name: string;
  baseUrl: string;
  prefix: string;
  placeholder: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

const SOCIAL_PLATFORMS: Record<string, PlatformConfig> = {
  Instagram: {
    name: "Instagram",
    baseUrl: "https://instagram.com/",
    prefix: "@",
    placeholder: "",
    icon: FaInstagram,
    color: "text-pink-600",
  },
  Twitter: {
    name: "Twitter",
    baseUrl: "https://twitter.com/",
    prefix: "@",
    placeholder: "",
    icon: FaTwitter,
    color: "text-blue-400",
  },
  LinkedIn: {
    name: "LinkedIn",
    baseUrl: "",
    prefix: "linkedin.com/in/",
    placeholder: "your-profile",
    icon: FaLinkedin,
    color: "text-blue-700",
  },
  Facebook: {
    name: "Facebook",
    baseUrl: "https://facebook.com/",
    prefix: "@",
    placeholder: "",
    icon: FaFacebook,
    color: "text-blue-600",
  },
  TikTok: {
    name: "TikTok",
    baseUrl: "https://tiktok.com/",
    prefix: "@",
    placeholder: "",
    icon: FaTiktok,
    color: "text-black dark:text-white",
  },
  Discord: {
    name: "Discord",
    baseUrl: "",
    prefix: "user#000000",
    placeholder: "",
    icon: FaDiscord,
    color: "text-indigo-600",
  },
  Snapchat: {
    name: "Snapchat",
    baseUrl: "https://snapchat.com/add/",
    prefix: "@",
    placeholder: "",
    icon: FaSnapchat,
    color: "text-yellow-400",
  },
};

function socialInputValue(platform: string, url: string) {
  const config = SOCIAL_PLATFORMS[platform];
  if (!config) return url;

  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    const path = parsed.pathname.replace(/^\/+|\/+$/g, "");

    if (platform === "LinkedIn") return path.replace(/^in\//, "");
    if (path) return path.split("/")[0].replace(/^@/, "");
  } catch {
    // Fall through to string cleanup for handles or partial URLs.
  }

  return url
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(config.baseUrl?.replace(/^https?:\/\//, "") || "", "")
    .replace(config.prefix, "")
    .replace(/^@/, "")
    .replace(/^\/+|\/+$/g, "");
}

function selectedUserFromId(id: string): SelectedConnectionUser {
  return {
    id,
    name: "",
    preferred_name: null,
    profile_image_url: null,
  };
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<"network" | "inbox" | "profile">(
    () =>
      typeof window === "undefined"
        ? "network"
        : getInitialDashboardTab(window.location.search),
  );
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [connections, setConnections] = useState<unknown[]>([]);
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [socialVerifications, setSocialVerifications] = useState<
    SocialVerification[]
  >([]);
  const [blockedUsers, setBlockedUsers] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isEditingSocials, setIsEditingSocials] = useState(false);
  const [showConnectionsModal, setShowConnectionsModal] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showBlockedModal, setShowBlockedModal] = useState(false);
  const [profileSection, setProfileSection] = useState<"about" | "socials">(
    "about",
  );
  const [connectionsSearch, setConnectionsSearch] = useState("");
  const [connectionTypeFilter, setConnectionTypeFilter] = useState<
    "all" | "first" | "one_point_five"
  >("all");
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [selectedConnectionUser, setSelectedConnectionUser] =
    useState<SelectedConnectionUser | null>(() => {
      if (typeof window === "undefined") return null;
      const profileId = new URLSearchParams(window.location.search).get("profile");
      return profileId ? selectedUserFromId(profileId) : null;
    });
  const [editForm, setEditForm] = useState({
    name: "",
    preferred_name: "",
    bio: "",
    profile_image_url: "",
  });
  const [socialInputs, setSocialInputs] = useState<Record<string, string>>({});
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [inboxUnreadCount, setInboxUnreadCount] = useState(0);
  const [networkGraphRefresh, setNetworkGraphRefresh] = useState(0);
  const [networkPathFilter, setNetworkPathFilter] =
    useState<NetworkPathFilter | null>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const verifiedSocialRows = useMemo(
    () =>
      getVerifiedSocialRows({
        links: socialLinks,
        verifications: socialVerifications,
      }),
    [socialLinks, socialVerifications],
  );

  // Pre-fill social inputs when entering profile or socials edit mode.
  useEffect(() => {
    if (isEditingProfile || isEditingSocials) {
      const inputs: Record<string, string> = {};
      socialLinks.forEach((link) => {
        inputs[link.platform] = socialInputValue(link.platform, link.url);
      });
      setSocialInputs(inputs);
    }
  }, [isEditingProfile, isEditingSocials, socialLinks]);
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (activeTab === "network") {
      params.delete("tab");
    } else {
      params.set("tab", activeTab);
    }

    if (selectedConnectionUser) {
      params.set("profile", selectedConnectionUser.id);
    } else {
      params.delete("profile");
    }

    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}`;
    if (nextUrl !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, "", nextUrl);
    }
  }, [activeTab, selectedConnectionUser]);

  useEffect(() => {
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search);
      setActiveTab(getInitialDashboardTab(window.location.search));
      const profileId = params.get("profile");
      setSelectedConnectionUser(profileId ? selectedUserFromId(profileId) : null);
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close modals with Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowConnectionsModal(false);
        setShowSearchModal(false);
        setShowBlockedModal(false);
        setShowProfileMenu(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Close profile menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(e.target as Node)
      ) {
        setShowProfileMenu(false);
      }
    }
    if (showProfileMenu)
      document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showProfileMenu]);

  const loadData = async () => {
    const { user } = await getCurrentUser();
    if (!user) {
      router.push("/");
      return;
    }

    const { data: profile } = await getUserProfile(user.id);
    if (profile) {
      const typedProfile = profile as UserProfile;
      setUserProfile(typedProfile);
      setEditForm({
        name: typedProfile.name || "",
        preferred_name: typedProfile.preferred_name || "",
        bio: typedProfile.bio || "",
        profile_image_url: typedProfile.profile_image_url || "",
      });
    }
    // Load accepted connections via server API (includes mutual counts); fallback to client query
    try {
      const res = await fetch(
        `/api/connections/accepted?userId=${encodeURIComponent(user.id)}`,
      );
      if (res.ok) {
        const j = await res.json();
        setConnections(j.data || []);
      } else {
        const { data: conns } = await getUserConnections(user.id);
        if (conns) setConnections(conns);
      }
    } catch {
      const { data: conns } = await getUserConnections(user.id);
      if (conns) setConnections(conns);
    }

    // Inbox unread count
    try {
      const inboxRes = await fetch(
        `/api/inbox?userId=${encodeURIComponent(user.id)}`,
      );
      if (inboxRes.ok) {
        const inboxJson = await inboxRes.json();
        const inboxData = inboxJson?.data || {};
        setInboxUnreadCount((inboxData.received || []).length);
      }
    } catch {}

    const { data: links } = await getUserSocialLinks(user.id);
    if (links) setSocialLinks(links as SocialLink[]);

    try {
      const verificationRes = await fetch("/api/social-verifications");
      if (verificationRes.ok) {
        const verificationJson = (await verificationRes.json()) as {
          data?: SocialVerification[];
        };
        setSocialVerifications(verificationJson.data || []);
      }
    } catch {
      setSocialVerifications([]);
    }

    const { data: blocked, error: blockedError } = await getBlockedUsers(
      user.id,
    );
    if (blockedError) {
      console.error("Error loading blocked users:", blockedError);
    }
    if (blocked) {
      console.log("Loaded blocked users:", blocked);
      setBlockedUsers(blocked);
    } else {
      console.log("No blocked users found");
      setBlockedUsers([]);
    }

    setLoading(false);
  };

  const handleConnectionChanged = () => {
    setNetworkGraphRefresh((value) => value + 1);
    void loadData();
  };

  const handleShortestPathFilter = (path: NetworkPathFilter) => {
    setNetworkPathFilter(path);
    setActiveTab("network");
  };

  // Build a flat list of the other user for accepted connections
  const connectionUsers: {
    id: string;
    name: string;
    preferred_name: string | null;
    profile_image_url: string | null;
    how_met?: string;
    connection_type?: "first" | "one_point_five";
  }[] = (connections as unknown[]).flatMap((c) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const conn = c as any;
      const meId = userProfile?.id;
      if (!meId) return [];
      const other = conn.other_user
        ? conn.other_user
        : conn.requester?.id === meId
          ? conn.recipient
          : conn.requester;
      if (!other) return [];
      return [
        {
          id: other.id as string,
          name: other.name as string,
          preferred_name: (other.preferred_name as string) ?? null,
          profile_image_url: (other.profile_image_url as string) ?? null,
          how_met: (conn.how_met as string) ?? "",
          connection_type:
            (conn.connection_type as "first" | "one_point_five") ||
            "one_point_five",
        },
      ];
    } catch {
      return [];
    }
  });

  const filteredConnectionUsers = connectionUsers.filter((u) => {
    // Filter by type
    if (
      connectionTypeFilter !== "all" &&
      u.connection_type !== connectionTypeFilter
    ) {
      return false;
    }
    // Filter by search
    const q = connectionsSearch.trim().toLowerCase();
    if (!q) return true;
    const display = `${u.name} ${u.preferred_name ?? ""}`.toLowerCase();
    return display.includes(q);
  });

  const handleEditProfile = () => {
    setIsEditingProfile(true);
  };

  const handleCancelEdit = () => {
    if (userProfile) {
      setEditForm({
        name: userProfile.name,
        preferred_name: userProfile.preferred_name || "",
        bio: userProfile.bio || "",
        profile_image_url: userProfile.profile_image_url || "",
      });
    }
    setIsEditingProfile(false);
  };

  const handleSaveProfile = async () => {
    if (!userProfile) return;

    try {
      const { data, error } = await updateUserProfile(userProfile.id, {
        name: editForm.name,
        preferred_name: editForm.preferred_name || null,
        bio: editForm.bio || null,
        profile_image_url: editForm.profile_image_url || null,
      });

      if (error) throw error;
      if (data) setUserProfile(data as UserProfile);
      setIsEditingProfile(false);
      await loadData();
    } catch (error) {
      setMessage({
        type: "error",
        text: (error as Error).message || "Failed to save profile",
      });
    }
  };

  const getVerification = (platform: string) => {
    const provider = VERIFIABLE_SOCIAL_PROVIDERS[platform];
    if (!provider) return null;
    return (
      socialVerifications.find(
        (verification) => verification.provider === provider,
      ) || null
    );
  };

  const handleVerifySocial = (platform: string) => {
    const provider = VERIFIABLE_SOCIAL_PROVIDERS[platform];
    if (!provider) return;
    signIn(provider, { callbackUrl: "/?tab=profile" });
  };

  const handleUnlinkVerifiedSocial = async (platform: string) => {
    const provider = VERIFIABLE_SOCIAL_PROVIDERS[platform];
    if (!provider) return;
    if (!confirm(`Sign out of ${platform}?`)) return;

    try {
      const response = await fetch("/api/social-verifications", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error?.message || "Failed to sign out");
      }
      await loadData();
    } catch (error) {
      setMessage({
        type: "error",
        text: (error as Error).message || "Failed to sign out",
      });
    }
  };

  const handleAddSocialLink = async (platform: string, value: string) => {
    if (!userProfile || !value.trim()) return;

    const platformConfig = SOCIAL_PLATFORMS[platform];
    let fullUrl = value;

    // Build full URL if not already a URL
    if (platformConfig && !value.startsWith("http")) {
      if (platformConfig.prefix && platform === "LinkedIn") {
        // For LinkedIn, prefix is the full path
        fullUrl = "https://" + platformConfig.prefix + value;
      } else if (platformConfig.baseUrl) {
        // For other platforms with baseUrl
        fullUrl = platformConfig.baseUrl + value;
      }
    }

    // Check if link already exists for this platform
    const existingLink = socialLinks.find((link) => link.platform === platform);

    // If exists, delete it first
    if (existingLink) {
      await deleteSocialLink(existingLink.id);
    }

    // Add the new/updated link
    await addSocialLink({
      user_id: userProfile.id,
      platform: platform,
      url: fullUrl,
    });

    loadData();
  };

  const handleDeleteSocialLink = async (linkId: string) => {
    await deleteSocialLink(linkId);
    loadData();
  };

  const handleUnblock = async (blockedId: string) => {
    if (!userProfile) return;
    const { error } = await unblockUser(userProfile.id, blockedId);
    if (error) {
      console.error("Error unblocking user:", error);
      setMessage({ type: "error", text: "Failed to unblock user" });
    } else {
      setMessage({ type: "success", text: "User unblocked successfully" });
    }
    loadData();
  };

  const handleSignOut = async () => {
    await nextAuthSignOut({ callbackUrl: "/" });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-950 gap-3">
        <Spinner size="lg" />
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
          Loading your network...
        </p>
      </div>
    );
  }

  const panelOpen = !!selectedConnectionUser;

  return (
    <div
      className={`flex flex-col min-h-screen bg-gray-50 dark:bg-gray-950 transition-[margin-right] duration-300 ${panelOpen ? "sm:mr-[480px]" : ""}`}
    >
      {/* Combined header + nav */}
      <header className="sticky top-0 z-50 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center gap-2 h-[52px]">
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 hidden md:inline">
              6steps
            </span>

            <div className="h-4 w-px bg-gray-200 dark:bg-gray-700 flex-shrink-0" />

            {/* Tabs */}
            <div className="flex items-center gap-0.5 flex-1 overflow-x-auto">
              {(
                [
                  { key: "network", label: "Network", Icon: Network },
                  { key: "inbox", label: "Inbox", Icon: InboxIcon },
                ] as const
              ).map(({ key, label, Icon }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={[
                    "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-100 whitespace-nowrap flex-shrink-0",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
                    activeTab === key
                      ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50",
                  ].join(" ")}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{label}</span>
                  {key === "inbox" && inboxUnreadCount > 0 && (
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSearchModal(true)}
              >
                <Search className="w-4 h-4" />
              </Button>
              <div className="relative" ref={profileMenuRef}>
                <button
                  onClick={() => setShowProfileMenu((v) => !v)}
                  className={[
                    "flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors",
                    activeTab === "profile"
                      ? "bg-gray-100 dark:bg-gray-800"
                      : "hover:bg-gray-100 dark:hover:bg-gray-800",
                  ].join(" ")}
                >
                  <Avatar
                    size="xs"
                    name={
                      userProfile?.preferred_name || userProfile?.name || "?"
                    }
                    imageUrl={userProfile?.profile_image_url}
                  />
                  <span className="hidden sm:inline text-xs font-medium text-gray-700 dark:text-gray-300">
                    {userProfile?.preferred_name || userProfile?.name}
                  </span>
                </button>
                {showProfileMenu && (
                  <div className="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-lg overflow-hidden z-50">
                    <button
                      onClick={() => {
                        setActiveTab("profile");
                        setShowProfileMenu(false);
                      }}
                      className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center gap-2"
                    >
                      <User className="w-3.5 h-3.5 text-gray-400" />
                      Profile
                    </button>
                    <div className="border-t border-gray-100 dark:border-gray-800" />
                    <button
                      onClick={handleSignOut}
                      className="w-full text-left px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center gap-2"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {activeTab === "network" && (
          <div key="network" className="animate-fade-in flex-1 flex flex-col">
            <NetworkGraph
              pathFilter={networkPathFilter}
              refreshNonce={networkGraphRefresh}
              onClearPathFilter={() => setNetworkPathFilter(null)}
              onOpenUser={(u) =>
                setSelectedConnectionUser({
                  id: u.id,
                  name: u.name || "",
                  preferred_name: u.preferred_name ?? null,
                  profile_image_url: u.profile_image_url ?? null,
                })
              }
            />
          </div>
        )}

        {activeTab === "inbox" && (
          <div key="inbox" className="animate-fade-in flex-1 w-full">
            <Inbox
              onChanged={handleConnectionChanged}
              refreshNonce={networkGraphRefresh}
              onOpenProfile={(userId) => {
                setSelectedConnectionUser(selectedUserFromId(userId));
              }}
            />
          </div>
        )}

        {activeTab === "profile" && userProfile && (
          <div
            key="profile"
            className="animate-fade-in max-w-7xl mx-auto px-4 py-8 w-full"
          >
            <div className="space-y-6">
              <div className="border-b border-gray-200 dark:border-gray-800">
                <div className="flex items-center justify-center gap-8">
                  <button
                    type="button"
                    onClick={() => setProfileSection("about")}
                    className={[
                      "border-b-2 px-1 pb-3 text-xs font-semibold uppercase tracking-[0.14em] transition-colors",
                      profileSection === "about"
                        ? "border-gray-900 text-gray-900 dark:border-gray-100 dark:text-gray-100"
                        : "border-transparent text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300",
                    ].join(" ")}
                  >
                    About
                  </button>
                  <button
                    type="button"
                    onClick={() => setProfileSection("socials")}
                    className={[
                      "border-b-2 px-1 pb-3 text-xs font-semibold uppercase tracking-[0.14em] transition-colors",
                      profileSection === "socials"
                        ? "border-gray-900 text-gray-900 dark:border-gray-100 dark:text-gray-100"
                        : "border-transparent text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300",
                    ].join(" ")}
                  >
                    Socials
                  </button>
                </div>
              </div>

              {profileSection === "about" && (
                <Card>
                  <div className="flex flex-col md:flex-row items-start gap-6">
                    {/* Avatar */}
                    <div className="flex-shrink-0">
                      {isEditingProfile ? (
                        <div className="flex flex-col items-center gap-3">
                          <Avatar
                            name={editForm.name || "?"}
                            imageUrl={editForm.profile_image_url || null}
                            size="xl"
                          />
                          <Input
                            value={editForm.profile_image_url}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                profile_image_url: e.target.value,
                              })
                            }
                            placeholder="Image URL (optional)"
                            className="w-48 text-xs"
                          />
                        </div>
                      ) : (
                        <Avatar
                          name={userProfile.preferred_name || userProfile.name}
                          imageUrl={userProfile.profile_image_url}
                          size="xl"
                        />
                      )}
                    </div>

                    {/* User Info */}
                    <div className="flex-1 min-w-0">
                      {!isEditingProfile ? (
                        <>
                          <h1 className="text-2xl font-bold mb-1 text-gray-900 dark:text-gray-100">
                            {userProfile.preferred_name || userProfile.name}
                          </h1>
                          {userProfile.bio && (
                            <p className="text-sm text-gray-700 dark:text-gray-300 mb-4 max-w-2xl">
                              {userProfile.bio}
                            </p>
                          )}
                          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                            {userProfile.email}
                          </p>
                          <button
                            onClick={() => setShowConnectionsModal(true)}
                            className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors hover:underline"
                          >
                            <span className="font-semibold">
                              {connections.length}
                            </span>{" "}
                            {connections.length === 1
                              ? "Connection"
                              : "Connections"}
                          </button>
                          {blockedUsers.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setShowBlockedModal(true)}
                              className="mt-1 block text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors hover:underline"
                            >
                              {blockedUsers.length} blocked
                            </button>
                          )}
                        </>
                      ) : (
                        <div className="space-y-3">
                          <Input
                            label="Full Name"
                            value={editForm.name}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                name: e.target.value,
                              })
                            }
                            placeholder="Full Name"
                          />
                          <Input
                            label="Preferred Name"
                            value={editForm.preferred_name}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                preferred_name: e.target.value,
                              })
                            }
                            placeholder="Preferred Name (optional)"
                          />
                          <div>
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                              Bio
                            </label>
                            <textarea
                              value={editForm.bio}
                              onChange={(e) =>
                                setEditForm({
                                  ...editForm,
                                  bio: e.target.value,
                                })
                              }
                              placeholder="A short bio..."
                              rows={3}
                              className="w-full px-3 py-2.5 text-sm rounded-lg resize-none bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex-shrink-0 flex flex-col gap-2">
                      {!isEditingProfile ? (
                        <button
                          type="button"
                          aria-label="Edit profile"
                          title="Edit profile"
                          onClick={handleEditProfile}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            aria-label="Save profile"
                            title="Save profile"
                            onClick={handleSaveProfile}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white transition-colors hover:bg-indigo-500"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            aria-label="Cancel profile edit"
                            title="Cancel profile edit"
                            onClick={handleCancelEdit}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </Card>
              )}

              {profileSection === "socials" && (
                <Card>
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      Socials
                    </h3>
                    {!isEditingSocials ? (
                      <button
                        type="button"
                        aria-label="Edit socials"
                        title="Edit socials"
                        onClick={() => setIsEditingSocials(true)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    ) : (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          aria-label="Save socials"
                          title="Save socials"
                          onClick={() => setIsEditingSocials(false)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white transition-colors hover:bg-indigo-500"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          aria-label="Cancel socials edit"
                          title="Cancel socials edit"
                          onClick={() => setIsEditingSocials(false)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  {!isEditingSocials ? (
                    /* View mode: only show platforms that have links */
                    socialLinks.length === 0 &&
                    verifiedSocialRows.length === 0 ? (
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        No socials added yet.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {socialLinks.map((link) => {
                          const config = SOCIAL_PLATFORMS[link.platform];
                          const Icon = config?.icon;
                          const verification = getVerification(link.platform);
                          const canVerify =
                            getSocialLinkEntryMode(link.platform) ===
                            "verified-sign-in";
                          const handle = link.url
                            .replace(/^https?:\/\//, "")
                            .replace(
                              config?.baseUrl?.replace(/^https?:\/\//, "") ||
                                "",
                              "",
                            )
                            .replace(config?.prefix || "", "")
                            .replace(/^\//, "");
                          return (
                            <div
                              key={link.id}
                              className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                            >
                              {Icon && (
                                <Icon
                                  className={`text-base flex-shrink-0 ${config.color}`}
                                />
                              )}
                              <span className="text-sm text-gray-900 dark:text-gray-100 font-medium flex-shrink-0">
                                {link.platform}
                              </span>
                              <a
                                href={link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-gray-500 dark:text-gray-400 truncate flex-1 hover:text-indigo-600 dark:hover:text-indigo-400"
                              >
                                {handle || link.url}
                              </a>
                              {verification ? (
                                <span
                                  title={
                                    verification.display_name ||
                                    verification.provider_account_id
                                  }
                                  className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                                >
                                  Verified
                                </span>
                              ) : canVerify ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleVerifySocial(link.platform)
                                  }
                                  className="rounded-md bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-500"
                                >
                                  Verify
                                </button>
                              ) : null}
                            </div>
                          );
                        })}
                        {verifiedSocialRows.map((row) => {
                          const config = SOCIAL_PLATFORMS[row.platform];
                          const Icon = config?.icon;

                          return (
                            <div
                              key={`verified-${row.platform}`}
                              className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                            >
                              {Icon && (
                                <Icon
                                  className={`text-base flex-shrink-0 ${config.color}`}
                                />
                              )}
                              <span className="text-sm text-gray-900 dark:text-gray-100 font-medium flex-shrink-0">
                                {row.platform}
                              </span>
                              {row.url ? (
                                <a
                                  href={row.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-gray-500 dark:text-gray-400 truncate flex-1 hover:text-indigo-600 dark:hover:text-indigo-400"
                                >
                                  {row.label}
                                </a>
                              ) : (
                                <span className="text-xs text-gray-500 dark:text-gray-400 truncate flex-1">
                                  {row.label}
                                </span>
                              )}
                              <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                                Verified
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )
                  ) : (
                    <div className="space-y-3">
                      {Object.entries(SOCIAL_PLATFORMS).map(([key, config]) => {
                        const Icon = config.icon;
                        const existingLink = socialLinks.find(
                          (l) => l.platform === key,
                        );
                        const verification = getVerification(key);
                        const isSignInOnly =
                          getSocialLinkEntryMode(key) === "verified-sign-in";

                        if (isSignInOnly) {
                          return (
                            <div
                              key={key}
                              className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-700 dark:bg-gray-800"
                            >
                              <Icon
                                className={`text-base flex-shrink-0 w-5 ${config.color}`}
                              />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                  {config.name}
                                </p>
                                <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                                  {verification
                                    ? verification.display_name ||
                                      verification.provider_account_id
                                    : "Verify by signing in"}
                                </p>
                              </div>
                              {verification ? (
                                <button
                                  type="button"
                                  onClick={() => handleUnlinkVerifiedSocial(key)}
                                  title={`Sign out of ${config.name}`}
                                  aria-label={`Sign out of ${config.name}`}
                                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
                                >
                                  <Unlink className="h-4 w-4" />
                                </button>
                              ) : (
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => handleVerifySocial(key)}
                                >
                                  Sign in
                                </Button>
                              )}
                            </div>
                          );
                        }

                        return (
                          <div key={key} className="flex items-center gap-3">
                            <Icon
                              className={`text-base flex-shrink-0 w-5 ${config.color}`}
                            />
                            <div className="flex-1 flex items-center border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-transparent overflow-hidden">
                              <span className="px-3 py-2.5 text-xs text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700 whitespace-nowrap flex-shrink-0">
                                {config.prefix}
                              </span>
                              <input
                                type="text"
                                value={socialInputs[key] || ""}
                                onChange={(e) =>
                                  setSocialInputs({
                                    ...socialInputs,
                                    [key]: e.target.value,
                                  })
                                }
                                onBlur={(e) => {
                                  const value = e.target.value.trim();
                                  if (value) {
                                    handleAddSocialLink(key, value);
                                  } else if (existingLink) {
                                    handleDeleteSocialLink(existingLink.id);
                                  }
                                }}
                                placeholder={config.placeholder || "username"}
                                className="flex-1 px-3 py-2.5 text-sm bg-transparent border-0 focus:outline-none focus:ring-0 text-gray-900 dark:text-gray-100"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Search Modal */}
      <Modal
        open={showSearchModal}
        onClose={() => setShowSearchModal(false)}
        title="Search Users"
        maxWidth="max-w-4xl"
      >
        <div className="border-b border-gray-200 dark:border-gray-800 px-5 pt-4 pb-3">
          <Input
            value={connectionsSearch}
            onChange={(e) => setConnectionsSearch(e.target.value)}
            placeholder="Search by name..."
          />
        </div>
        <ConnectionManager
          searchQuery={connectionsSearch}
          onOpenUser={(u) => {
            setSelectedConnectionUser(u);
            setShowSearchModal(false);
          }}
        />
      </Modal>

      {/* Blocked Users Modal */}
      <Modal
        open={showBlockedModal}
        onClose={() => setShowBlockedModal(false)}
        title="Blocked Users"
      >
        <div className="p-5 space-y-3">
          {blockedUsers.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center">
              <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
                <User className="w-5 h-5 text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                No blocked users
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                You haven&apos;t blocked anyone
              </p>
            </div>
          ) : (
            blockedUsers.map((blocked) => {
              const blockedData = blocked as {
                id: string;
                blocked_id: string;
                blocked_user: {
                  preferred_name: string | null;
                  name: string;
                  profile_image_url: string | null;
                };
              };
              return (
                <div
                  key={blockedData.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Avatar
                      name={
                        blockedData.blocked_user.preferred_name ||
                        blockedData.blocked_user.name
                      }
                      imageUrl={blockedData.blocked_user.profile_image_url}
                      size="sm"
                    />
                    <div>
                      <button
                        onClick={() => {
                          setSelectedConnectionUser({
                            id: blockedData.blocked_id,
                            name: blockedData.blocked_user.name,
                            preferred_name:
                              blockedData.blocked_user.preferred_name,
                            profile_image_url:
                              blockedData.blocked_user.profile_image_url,
                          });
                          setShowBlockedModal(false);
                        }}
                        className="text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors text-left"
                      >
                        {blockedData.blocked_user.preferred_name ||
                          blockedData.blocked_user.name}
                      </button>
                      <p className="text-xs text-red-500 dark:text-red-400">
                        Blocked
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleUnblock(blockedData.blocked_id)}
                  >
                    Unblock
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </Modal>

      {/* Connections Modal */}
      <Modal
        open={showConnectionsModal}
        onClose={() => setShowConnectionsModal(false)}
        title={`Connections (${connectionUsers.length})`}
      >
        <div className="px-5 pt-4 pb-2 space-y-3 border-b border-gray-200 dark:border-gray-800">
          <Input
            value={connectionsSearch}
            onChange={(e) => setConnectionsSearch(e.target.value)}
            placeholder="Search by name..."
          />
          <div className="flex gap-2">
            {(
              [
                {
                  key: "all" as const,
                  label: `All (${connectionUsers.length})`,
                },
                {
                  key: "first" as const,
                  label: `Strong (${connectionUsers.filter((u) => u.connection_type === "first").length})`,
                },
                {
                  key: "one_point_five" as const,
                  label: `Weak (${connectionUsers.filter((u) => u.connection_type === "one_point_five").length})`,
                },
              ] as const
            ).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setConnectionTypeFilter(key)}
                className={[
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                  connectionTypeFilter === key
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700",
                ].join(" ")}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-[50vh] overflow-y-auto">
          {filteredConnectionUsers.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center">
              {connectionsSearch.trim()
                ? "No users found"
                : "No connections yet"}
            </p>
          ) : (
            filteredConnectionUsers.map((u) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const connMatch = (connections as any[]).find((c) => {
                const other = c.other_user || c.recipient || c.requester;
                return other && other.id === u.id;
              });
              const mc = connMatch?.mutualCount as number | undefined;
              return (
                <button
                  key={u.id}
                  className="w-full text-left flex items-center gap-3 py-3 px-5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  onClick={() => {
                    setSelectedConnectionUser(u);
                    setShowConnectionsModal(false);
                  }}
                >
                  <Avatar
                    name={u.preferred_name || u.name}
                    imageUrl={u.profile_image_url}
                    size="md"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {u.preferred_name || u.name}
                      </span>
                      {u.connection_type && (
                        <Badge
                          variant={connectionTypeBadge(u.connection_type)}
                        />
                      )}
                    </div>
                    {u.how_met && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                        {u.how_met}
                      </p>
                    )}
                  </div>
                  {typeof mc === "number" && (
                    <span className="hidden sm:inline text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-medium flex-shrink-0">
                      {mc} mutual{mc === 1 ? "" : "s"}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </Modal>

      {/* Profile side panel for a selected connection */}
      {selectedConnectionUser && userProfile && (
        <UserProfileSidePanel
          open={!!selectedConnectionUser}
          currentUserId={userProfile.id}
          userId={selectedConnectionUser.id}
          onClose={() => setSelectedConnectionUser(null)}
          onChanged={handleConnectionChanged}
          onShortestPath={handleShortestPathFilter}
          refreshNonce={networkGraphRefresh}
        />
      )}
    </div>
  );
}
