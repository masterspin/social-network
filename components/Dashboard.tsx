"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
  signOut,
} from "@/lib/supabase/queries";
import { Database } from "@/types/supabase";
import NetworkGraph from "./NetworkGraph";
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

type UserProfile = Database["public"]["Tables"]["users"]["Row"];
type SocialLink = Database["public"]["Tables"]["social_links"]["Row"];

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

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<
    "network" | "search" | "inbox" | "profile" | "blocked"
  >("network");
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [connections, setConnections] = useState<unknown[]>([]);
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [showConnectionsModal, setShowConnectionsModal] = useState(false);
  const [connectionsSearch, setConnectionsSearch] = useState("");
  const [connectionTypeFilter, setConnectionTypeFilter] = useState<"all" | "first" | "one_point_five">("all");
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [selectedConnectionUser, setSelectedConnectionUser] = useState<{
    id: string;
    username: string;
    name: string;
    preferred_name: string | null;
    profile_image_url: string | null;
  } | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    username: "",
    preferred_name: "",
    gender: "",
    bio: "",
    profile_image_url: "",
    visibility_level: 3,
    show_profile_image: true,
    show_full_name: true,
    show_gender: true,
    show_social_links: true,
  });
  const [socialInputs, setSocialInputs] = useState<Record<string, string>>({});

  // Pre-fill social inputs when entering edit mode
  useEffect(() => {
    if (isEditingProfile) {
      const inputs: Record<string, string> = {};
      socialLinks.forEach((link) => {
        const platformConfig = SOCIAL_PLATFORMS[link.platform];
        if (platformConfig) {
          // Extract the username/handle from the URL
          const username = link.url
            .replace(/^https?:\/\//, "")
            .replace(
              platformConfig.baseUrl?.replace(/^https?:\/\//, "") || "",
              ""
            )
            .replace(platformConfig.prefix, "");
          inputs[link.platform] = username;
        }
      });
      setSocialInputs(inputs);
    }
  }, [isEditingProfile, socialLinks]);
  const router = useRouter();

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close connections modal with Escape
  useEffect(() => {
    if (!showConnectionsModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowConnectionsModal(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showConnectionsModal]);

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
        username: typedProfile.username || "",
        preferred_name: typedProfile.preferred_name || "",
        gender: typedProfile.gender || "",
        bio: typedProfile.bio || "",
        profile_image_url: typedProfile.profile_image_url || "",
        visibility_level: (typedProfile.visibility_level as number) || 0,
        show_profile_image: typedProfile.show_profile_image ?? true,
        show_full_name: typedProfile.show_full_name ?? true,
        show_gender: typedProfile.show_gender ?? true,
        show_social_links: typedProfile.show_social_links ?? true,
      });
    }
    // Load accepted connections via server API (includes mutual counts); fallback to client query
    try {
      const res = await fetch(
        `/api/connections/accepted?userId=${encodeURIComponent(
          user.id
        )}`
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

    const { data: links } = await getUserSocialLinks(user.id);
    if (links) setSocialLinks(links as SocialLink[]);

    const { data: blocked, error: blockedError } = await getBlockedUsers(user.id);
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

  // Build a flat list of the other user for accepted connections
  const connectionUsers: {
    id: string;
    username: string;
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
          username: other.username as string,
          name: other.name as string,
          preferred_name: (other.preferred_name as string) ?? null,
          profile_image_url: (other.profile_image_url as string) ?? null,
          how_met: (conn.how_met as string) ?? "",
          connection_type: (conn.connection_type as "first" | "one_point_five") || "first",
        },
      ];
    } catch {
      return [];
    }
  });

  const filteredConnectionUsers = connectionUsers.filter((u) => {
    // Filter by type
    if (connectionTypeFilter !== "all" && u.connection_type !== connectionTypeFilter) {
      return false;
    }
    // Filter by search
    const q = connectionsSearch.trim().toLowerCase();
    if (!q) return true;
    const display = `${u.username} ${u.name} ${
      u.preferred_name ?? ""
    }`.toLowerCase();
    return display.includes(q);
  });

  const handleEditProfile = () => {
    setIsEditingProfile(true);
  };

  const handleCancelEdit = () => {
    if (userProfile) {
      setEditForm({
        name: userProfile.name,
        username: userProfile.username,
        preferred_name: userProfile.preferred_name || "",
        gender: userProfile.gender || "",
        bio: userProfile.bio || "",
        profile_image_url: userProfile.profile_image_url || "",
        visibility_level: userProfile.visibility_level ?? 0,
        show_profile_image: userProfile.show_profile_image ?? true,
        show_full_name: userProfile.show_full_name ?? true,
        show_gender: userProfile.show_gender ?? true,
        show_social_links: userProfile.show_social_links ?? true,
      });
    }
    setIsEditingProfile(false);
  };

  const handleSaveProfile = async () => {
    if (!userProfile) return;

    const { error } = await updateUserProfile(userProfile.id, {
      name: editForm.name,
      username: editForm.username,
      preferred_name: editForm.preferred_name || null,
      gender: editForm.gender || null,
      bio: editForm.bio || null,
      profile_image_url: editForm.profile_image_url || null,
      visibility_level: editForm.visibility_level,
      show_profile_image: editForm.show_profile_image,
      show_full_name: editForm.show_full_name,
      show_gender: editForm.show_gender,
      show_social_links: editForm.show_social_links,
    });

    if (!error) {
      setIsEditingProfile(false);
      loadData();
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

    // Clear the input for this platform
    setSocialInputs((prev) => ({
      ...prev,
      [platform]: "",
    }));
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
    await signOut();
    window.location.href = "/";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-950">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-16 w-16 border-4 border-gray-200 dark:border-gray-800 border-t-gray-900 dark:border-t-white mb-4"></div>
          <p className="text-xl font-medium text-gray-900 dark:text-white">
            Loading your network...
          </p>
        </div>
      </div>
    );
  }

  const panelOpen = !!selectedConnectionUser;

  return (
    <div
      className={`flex flex-col min-h-screen bg-gray-50 dark:bg-gray-950 transition-[margin] duration-300 ${
        panelOpen ? "sm:mr-[480px]" : ""
      }`}
    >
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            {/* Logo & User Info */}
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-gray-900 dark:bg-white rounded-lg flex items-center justify-center shadow-sm">
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  Social Network
                </h1>
                {userProfile && (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    @{userProfile.username}
                  </p>
                )}
              </div>
            </div>

            {/* Sign Out Button */}
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-medium transition-all hover:scale-105"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="sticky top-[73px] z-40 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex space-x-1">
            <button
              onClick={() => setActiveTab("network")}
              className={`group relative py-4 px-6 font-medium text-sm transition-colors ${
                activeTab === "network"
                  ? "text-gray-900 dark:text-white"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
              }`}
            >
              <span className="flex items-center gap-2">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                  />
                </svg>
                Network Graph
              </span>
              {activeTab === "network" && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900 dark:bg-white"></div>
              )}
            </button>

            <button
              onClick={() => setActiveTab("inbox")}
              className={`group relative py-4 px-6 font-medium text-sm transition-colors ${
                activeTab === "inbox"
                  ? "text-gray-900 dark:text-white"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
              }`}
            >
              <span className="flex items-center gap-2">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
                Inbox
              </span>
              {activeTab === "inbox" && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900 dark:bg-white"></div>
              )}
            </button>

            <button
              onClick={() => setActiveTab("search")}
              className={`group relative py-4 px-6 font-medium text-sm transition-colors ${
                activeTab === "search"
                  ? "text-gray-900 dark:text-white"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
              }`}
            >
              <span className="flex items-center gap-2">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-4.35-4.35M10 18a8 8 0 110-16 8 8 0 010 16z"
                  />
                </svg>
                Search
              </span>
              {activeTab === "search" && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900 dark:bg-white"></div>
              )}
            </button>

            <button
              onClick={() => setActiveTab("profile")}
              className={`group relative py-4 px-6 font-medium text-sm transition-colors ${
                activeTab === "profile"
                  ? "text-gray-900 dark:text-white"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
              }`}
            >
              <span className="flex items-center gap-2">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
                Profile
              </span>
              {activeTab === "profile" && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900 dark:bg-white"></div>
              )}
            </button>

            <button
              onClick={() => setActiveTab("blocked")}
              className={`group relative py-4 px-6 font-medium text-sm transition-colors ${
                activeTab === "blocked"
                  ? "text-gray-900 dark:text-white"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
              }`}
            >
              <span className="flex items-center gap-2">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                  />
                </svg>
                Blocked
                {blockedUsers.length > 0 && (
                  <span className="px-2 py-0.5 text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full font-semibold">
                    {blockedUsers.length}
                  </span>
                )}
              </span>
              {activeTab === "blocked" && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900 dark:bg-white"></div>
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="flex-1 overflow-hidden">
        {activeTab === "network" && (
          <NetworkGraph
            onOpenUser={(u) =>
              setSelectedConnectionUser({
                id: u.id,
                username: "",
                name: u.name || "",
                preferred_name: u.preferred_name ?? null,
                profile_image_url: u.profile_image_url ?? null,
              })
            }
          />
        )}

        {activeTab === "inbox" && (
          <div className="max-w-7xl mx-auto px-4 py-8">
            <Inbox
              onOpenProfile={(userId) => {
                setSelectedConnectionUser({
                  id: userId,
                  username: "",
                  name: "",
                  preferred_name: null,
                  profile_image_url: null,
                });
              }}
            />
          </div>
        )}

        {activeTab === "search" && (
          <div className="max-w-7xl mx-auto px-4 py-8">
            <ConnectionManager
              onOpenUser={(u) => setSelectedConnectionUser(u)}
            />
          </div>
        )}

        {activeTab === "profile" && userProfile && (
          <div className="max-w-7xl mx-auto px-4 py-8">
            {/* Hero Card with Profile Image, Username & Connections */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-sm p-8 mb-6">
              <div className="flex flex-col md:flex-row items-start gap-6">
                {/* Profile Image */}
                <div className="flex-shrink-0">
                  {!isEditingProfile ? (
                    userProfile.profile_image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={userProfile.profile_image_url}
                        alt="Profile"
                        className="w-32 h-32 rounded-full object-cover border-4 border-gray-200 dark:border-gray-700"
                      />
                    ) : (
                      <div className="w-32 h-32 rounded-full bg-gray-100 dark:bg-gray-800 border-4 border-gray-200 dark:border-gray-700 flex items-center justify-center">
                        <span className="text-5xl font-bold text-gray-600 dark:text-gray-400">
                          {userProfile.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-32 h-32 rounded-full bg-gray-100 dark:bg-gray-800 border-4 border-gray-200 dark:border-gray-700 flex items-center justify-center overflow-hidden">
                        {editForm.profile_image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={editForm.profile_image_url}
                            alt="Profile Preview"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-5xl font-bold text-gray-600 dark:text-gray-400">
                            {editForm.name.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <input
                        type="text"
                        value={editForm.profile_image_url}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            profile_image_url: e.target.value,
                          })
                        }
                        placeholder="Image URL"
                        className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm w-full max-w-xs"
                      />
                    </div>
                  )}
                </div>

                {/* User Info & Connections */}
                <div className="flex-1">
                  {!isEditingProfile ? (
                    <>
                      <h1 className="text-4xl font-bold mb-2 text-gray-900 dark:text-white">
                        {userProfile.preferred_name || userProfile.name}
                      </h1>
                      <p className="text-xl text-gray-600 dark:text-gray-400 mb-3">
                        @{userProfile.username}
                      </p>
                      {userProfile.bio && (
                        <p className="text-gray-600 dark:text-gray-400 text-lg mb-4 max-w-2xl">
                          {userProfile.bio}
                        </p>
                      )}
                      
                      {/* Connections Card - Inline */}
                      <div 
                        className="mt-4 inline-block bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border border-blue-200 dark:border-blue-700 rounded-xl p-4 cursor-pointer hover:shadow-md transition-all"
                        onClick={() => setShowConnectionsModal(true)}
                        role="button"
                        aria-label="View connections"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 dark:from-blue-600 dark:to-blue-700 rounded-xl flex items-center justify-center shadow-sm">
                            <svg
                              className="w-6 h-6 text-white"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                              />
                            </svg>
                          </div>
                          <div>
                            <p className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-blue-800 dark:from-blue-400 dark:to-blue-600 bg-clip-text text-transparent">
                              {connections.length}
                            </p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              Connections
                            </p>
                          </div>
                          <svg
                            className="w-5 h-5 text-gray-400 ml-2"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 5l7 7-7 7"
                            />
                          </svg>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) =>
                          setEditForm({ ...editForm, name: e.target.value })
                        }
                        placeholder="Full Name"
                        className="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-xl font-bold"
                      />
                      <input
                        type="text"
                        value={editForm.preferred_name}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            preferred_name: e.target.value,
                          })
                        }
                        placeholder="Preferred Name (optional)"
                        className="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg"
                      />
                      <input
                        type="text"
                        value={editForm.username}
                        onChange={(e) =>
                          setEditForm({ ...editForm, username: e.target.value })
                        }
                        placeholder="Username"
                        className="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg"
                      />
                      <textarea
                        value={editForm.bio}
                        onChange={(e) =>
                          setEditForm({ ...editForm, bio: e.target.value })
                        }
                        placeholder="Bio"
                        rows={3}
                        className="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg resize-none"
                      />
                    </div>
                  )}
                </div>

                {/* Edit/Save/Cancel Buttons */}
                <div className="flex-shrink-0 flex gap-3">
                  {!isEditingProfile ? (
                    <button
                      onClick={handleEditProfile}
                      className="px-6 py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 rounded-lg font-semibold transition-colors flex items-center gap-2"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                      Edit Profile
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={handleSaveProfile}
                        className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-colors flex items-center gap-2"
                      >
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                        Save
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="px-6 py-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-900 dark:text-white rounded-lg font-semibold transition-colors"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Full Width Content */}
            <div className="space-y-6">
              {/* About Card */}
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 border border-gray-200 dark:border-gray-700">
                <h3 className="text-xl font-bold mb-6 flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-gray-500 to-gray-600 dark:from-gray-600 dark:to-gray-700 rounded-xl flex items-center justify-center">
                    <svg
                      className="w-5 h-5 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                      />
                    </svg>
                  </div>
                  About
                </h3>
                <div className="space-y-6">
                  {/* Email (read-only) */}
                  <div className="flex items-start gap-3">
                    <svg
                      className="w-5 h-5 text-gray-400 mt-0.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Email
                      </p>
                      <p className="font-medium">{userProfile.email}</p>
                    </div>
                  </div>

                  {/* Gender */}
                  <div className="flex items-start gap-3">
                    <svg
                      className="w-5 h-5 text-gray-400 mt-0.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                      />
                    </svg>
                    <div className="flex-1">
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Gender
                      </p>
                      {!isEditingProfile ? (
                        <p className="font-medium">
                          {userProfile.gender || "Not specified"}
                        </p>
                      ) : (
                        <input
                          type="text"
                          value={editForm.gender}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              gender: e.target.value,
                            })
                          }
                          placeholder="Optional"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 mt-1"
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Social Links Card */}
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 border border-gray-200 dark:border-gray-700">
                  <h3 className="text-xl font-bold mb-6 flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 dark:from-purple-600 dark:to-purple-700 rounded-xl flex items-center justify-center">
                      <svg
                        className="w-5 h-5 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                        />
                      </svg>
                    </div>
                    Social Links
                  </h3>

                  {/* Social Links Grid - Always visible, editable in edit mode */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(SOCIAL_PLATFORMS)
                      .filter(([key]) => key !== "LinkedIn")
                      .map(([key, config]) => {
                        const Icon = config.icon;
                        const existingLink = socialLinks.find(
                          (link) => link.platform === key
                        );
                        return (
                          <div key={key} className="relative">
                            <label className="block mb-1.5">
                              <div className="flex items-center gap-2 text-sm font-medium mb-1">
                                <Icon className={`text-lg ${config.color}`} />
                                <span>{config.name}</span>
                              </div>
                            </label>
                            {!isEditingProfile ? (
                              existingLink ? (
                                <a
                                  href={existingLink.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="relative flex items-center border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors group"
                                >
                                  <span
                                    className={`px-3 py-2.5 text-sm text-gray-500 dark:text-gray-400 font-medium ${
                                      key !== "Discord"
                                        ? "border-r border-gray-300 dark:border-gray-600"
                                        : ""
                                    }`}
                                  >
                                    {config.prefix}
                                  </span>
                                  <span className="flex-1 px-3 py-2.5 text-sm truncate">
                                    {existingLink.url
                                      .replace(/^https?:\/\//, "")
                                      .replace(
                                        config.baseUrl?.replace(
                                          /^https?:\/\//,
                                          ""
                                        ) || "",
                                        ""
                                      )
                                      .replace(config.prefix, "")}
                                  </span>
                                  <svg
                                    className="w-4 h-4 text-gray-400 mr-3 opacity-0 group-hover:opacity-100 transition-opacity"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                    />
                                  </svg>
                                </a>
                              ) : (
                                <div className="relative flex items-center border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700/30">
                                  <span
                                    className={`px-3 py-2.5 text-sm text-gray-500 dark:text-gray-400 font-medium ${
                                      key !== "Discord"
                                        ? "border-r border-gray-300 dark:border-gray-600"
                                        : ""
                                    }`}
                                  >
                                    {config.prefix}
                                  </span>
                                  <span className="flex-1 px-3 py-2.5 text-sm text-gray-400 dark:text-gray-500"></span>
                                </div>
                              )
                            ) : (
                              <div className="relative flex items-center border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus-within:ring-2 focus-within:ring-teal-500 focus-within:border-transparent">
                                <span
                                  className={`px-3 py-2.5 text-sm text-gray-500 dark:text-gray-400 font-medium ${
                                    key !== "Discord"
                                      ? "border-r border-gray-300 dark:border-gray-600"
                                      : ""
                                  }`}
                                >
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
                                      // Save/update the link
                                      handleAddSocialLink(key, value);
                                    } else if (existingLink) {
                                      // Delete the link if field is cleared
                                      handleDeleteSocialLink(existingLink.id);
                                    }
                                  }}
                                  className="flex-1 px-3 py-2.5 text-sm bg-transparent border-0 focus:outline-none focus:ring-0"
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>

                  {/* LinkedIn full width at bottom */}
                  {SOCIAL_PLATFORMS.LinkedIn && (
                    <div className="relative mt-3">
                      <label className="block mb-1.5">
                        <div className="flex items-center gap-2 text-sm font-medium mb-1">
                          <FaLinkedin
                            className={`text-lg ${SOCIAL_PLATFORMS.LinkedIn.color}`}
                          />
                          <span>{SOCIAL_PLATFORMS.LinkedIn.name}</span>
                        </div>
                      </label>
                      {!isEditingProfile
                        ? (() => {
                            const existingLink = socialLinks.find(
                              (link) => link.platform === "LinkedIn"
                            );
                            return existingLink ? (
                              <a
                                href={existingLink.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="relative flex items-center border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors group"
                              >
                                <span className="px-3 py-2.5 text-sm text-gray-500 dark:text-gray-400 font-medium border-r border-gray-300 dark:border-gray-600">
                                  {SOCIAL_PLATFORMS.LinkedIn.prefix}
                                </span>
                                <span className="flex-1 px-3 py-2.5 text-sm truncate">
                                  {existingLink.url
                                    .replace(/^https?:\/\//, "")
                                    .replace(
                                      SOCIAL_PLATFORMS.LinkedIn.prefix,
                                      ""
                                    )}
                                </span>
                                <svg
                                  className="w-4 h-4 text-gray-400 mr-3 opacity-0 group-hover:opacity-100 transition-opacity"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                  />
                                </svg>
                              </a>
                            ) : (
                              <div className="relative flex items-center border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700/30">
                                <span className="px-3 py-2.5 text-sm text-gray-500 dark:text-gray-400 font-medium border-r border-gray-300 dark:border-gray-600">
                                  {SOCIAL_PLATFORMS.LinkedIn.prefix}
                                </span>
                                <span className="flex-1 px-3 py-2.5 text-sm text-gray-400 dark:text-gray-500"></span>
                              </div>
                            );
                          })()
                        : (() => {
                            const existingLink = socialLinks.find(
                              (link) => link.platform === "LinkedIn"
                            );
                            return (
                              <div className="relative flex items-center border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus-within:ring-2 focus-within:ring-teal-500 focus-within:border-transparent">
                                <span className="px-3 py-2.5 text-sm text-gray-500 dark:text-gray-400 font-medium border-r border-gray-300 dark:border-gray-600">
                                  {SOCIAL_PLATFORMS.LinkedIn.prefix}
                                </span>
                                <input
                                  type="text"
                                  value={socialInputs.LinkedIn || ""}
                                  onChange={(e) =>
                                    setSocialInputs({
                                      ...socialInputs,
                                      LinkedIn: e.target.value,
                                    })
                                  }
                                  onBlur={(e) => {
                                    const value = e.target.value.trim();
                                    if (value) {
                                      // Save/update the link
                                      handleAddSocialLink("LinkedIn", value);
                                    } else if (existingLink) {
                                      // Delete the link if field is cleared
                                      handleDeleteSocialLink(existingLink.id);
                                    }
                                  }}
                                  className="flex-1 px-3 py-2.5 text-sm bg-transparent border-0 focus:outline-none focus:ring-0"
                                />
                              </div>
                            );
                          })()}
                    </div>
                  )}
                </div>
              </div>

            </div>
        )}

        {activeTab === "blocked" && (
          <div className="max-w-7xl mx-auto px-4 py-8">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 md:p-8 border border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-red-600 dark:text-red-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                    />
                  </svg>
                </div>
                <div>
                  <h2 className="text-2xl font-bold">Blocked Users</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Manage users you&apos;ve blocked from your network
                  </p>
                </div>
              </div>

              {blockedUsers.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-20 h-20 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg
                      className="w-10 h-10 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <p className="text-gray-600 dark:text-gray-400 text-lg font-medium">
                    No blocked users
                  </p>
                  <p className="text-gray-500 dark:text-gray-500 text-sm mt-2">
                    You haven&apos;t blocked anyone yet
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {blockedUsers.map((blocked) => {
                    const blockedData = blocked as {
                      id: string;
                      blocked_id: string;
                      blocked_user: {
                        username: string;
                        preferred_name: string | null;
                        name: string;
                        profile_image_url: string | null;
                      };
                    };
                    return (
                      <div
                        key={blockedData.id}
                        className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-all border border-gray-200 dark:border-gray-600"
                      >
                        <div>
                          <button
                            onClick={() =>
                              setSelectedConnectionUser({
                                id: blockedData.blocked_id,
                                username: blockedData.blocked_user.username || "",
                                name: blockedData.blocked_user.name,
                                preferred_name: blockedData.blocked_user.preferred_name,
                                profile_image_url: blockedData.blocked_user.profile_image_url,
                              })
                            }
                            className="font-semibold text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors text-left"
                          >
                            {blockedData.blocked_user.preferred_name ||
                              blockedData.blocked_user.name}
                          </button>
                          <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
                            <svg
                              className="w-3 h-3"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                            <span className="font-medium">Blocked</span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleUnblock(blockedData.blocked_id)}
                          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-all hover:scale-105 shadow-md hover:shadow-lg"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"
                            />
                          </svg>
                          Unblock
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Connections Modal */}
      {showConnectionsModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
          onClick={() => setShowConnectionsModal(false)}
        >
          <div
            className="bg-white dark:bg-gray-900 w-full max-w-2xl mx-4 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold">Your Connections</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {connectionUsers.length} total
                </p>
              </div>
              <button
                onClick={() => setShowConnectionsModal(false)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                aria-label="Close"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
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
            <div className="px-5 pt-4 space-y-3">
              <input
                type="text"
                value={connectionsSearch}
                onChange={(e) => setConnectionsSearch(e.target.value)}
                placeholder="Search connections by name or username..."
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setConnectionTypeFilter("all")}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    connectionTypeFilter === "all"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                  }`}
                >
                  All ({connectionUsers.length})
                </button>
                <button
                  onClick={() => setConnectionTypeFilter("first")}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    connectionTypeFilter === "first"
                      ? "bg-green-600 text-white"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                  }`}
                >
                  1st ({connectionUsers.filter(u => u.connection_type === "first").length})
                </button>
                <button
                  onClick={() => setConnectionTypeFilter("one_point_five")}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    connectionTypeFilter === "one_point_five"
                      ? "bg-purple-600 text-white"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                  }`}
                >
                  1.5 ({connectionUsers.filter(u => u.connection_type === "one_point_five").length})
                </button>
              </div>
            </div>
            <div className="p-5 max-h-[60vh] overflow-y-auto divide-y divide-gray-200 dark:divide-gray-800">
              {filteredConnectionUsers.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center">
                  {connectionsSearch.trim()
                    ? "No matches found"
                    : "No connections yet"}
                </p>
              ) : (
                filteredConnectionUsers.map((u) => (
                  <button
                    key={u.id}
                    className="w-full text-left flex items-center gap-3 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg px-2 group"
                    onClick={() => {
                      setSelectedConnectionUser(u);
                      setShowConnectionsModal(false);
                    }}
                  >
                    {u.profile_image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={u.profile_image_url}
                        alt={u.name}
                        className="w-10 h-10 rounded-full object-cover border border-gray-200 dark:border-gray-700"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-700 dark:text-gray-200 font-semibold">
                        {(u.preferred_name || u.name).charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">
                          {u.preferred_name || u.name}
                          <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                            @{u.username}
                          </span>
                        </p>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            u.connection_type === "first"
                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                              : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                          }`}
                        >
                          {u.connection_type === "first" ? "1st" : "1.5"}
                        </span>
                      </div>
                      {u.how_met && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {u.how_met}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {/** Optional mutual count if present in server response */}
                      {(() => {
                        // Try to find mutual count from original source array for this user
                        // We search in connections for an item with other_user.id === u.id
                        // and read mutualCount if available.
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const match = (connections as any[]).find((c) => {
                          const other =
                            c.other_user || c.recipient || c.requester;
                          return other && other.id === u.id;
                        });
                        const mc = match?.mutualCount as number | undefined;
                        return typeof mc === "number" ? (
                          <span className="hidden sm:inline text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium">
                            {mc} mutual{mc === 1 ? "" : "s"}
                          </span>
                        ) : null;
                      })()}
                      <span className="text-sm text-blue-600 dark:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">
                        View
                      </span>
                      <svg
                        className="w-4 h-4 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Profile side panel for a selected connection */}
      {selectedConnectionUser && userProfile && (
        <UserProfileSidePanel
          open={!!selectedConnectionUser}
          currentUserId={userProfile.id}
          userId={selectedConnectionUser.id}
          onClose={() => setSelectedConnectionUser(null)}
          onChanged={() => loadData()}
        />
      )}
    </div>
  );
}
