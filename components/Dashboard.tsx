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
import MatchMaker from "./MatchMaker";
import MatchesList from "./MatchesList";
import ItineraryPlanner from "./ItineraryPlanner";
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
  Network,
  Inbox as InboxIcon,
  Heart,
  Map,
  User,
  Search,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Badge, connectionTypeBadge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";

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
    "network" | "inbox" | "profile" | "matches" | "itineraries"
  >("network");
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [connections, setConnections] = useState<unknown[]>([]);
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [showConnectionsModal, setShowConnectionsModal] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showBlockedModal, setShowBlockedModal] = useState(false);
  const [connectionsSearch, setConnectionsSearch] = useState("");
  const [connectionTypeFilter, setConnectionTypeFilter] = useState<
    "all" | "first" | "one_point_five"
  >("all");
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

  // Close modals with Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowConnectionsModal(false);
        setShowSearchModal(false);
        setShowBlockedModal(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
      });
    }
    // Load accepted connections via server API (includes mutual counts); fallback to client query
    try {
      const res = await fetch(
        `/api/connections/accepted?userId=${encodeURIComponent(user.id)}`
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

    const { data: blocked, error: blockedError } = await getBlockedUsers(
      user.id
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
          connection_type:
            (conn.connection_type as "first" | "one_point_five") || "first",
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
    const display = `${u.username} ${u.name} ${u.preferred_name ?? ""
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
      className={`flex flex-col min-h-screen bg-gray-50 dark:bg-gray-950 transition-[margin] duration-300 ${panelOpen ? "sm:mr-[480px]" : ""
        }`}
    >
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            {/* Logo & User Info */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                <Network className="w-4 h-4 text-white" />
              </div>
              <div>
                <h1 className="text-base font-semibold tracking-tight text-gray-900 dark:text-gray-100">
                  Amaedu
                </h1>
                {userProfile && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-none">
                    @{userProfile.username}
                  </p>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSearchModal(true)}
              >
                <Search className="w-4 h-4" />
                <span className="hidden sm:inline">Search</span>
              </Button>
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="sticky top-[57px] z-40 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center gap-1 py-2">
            {(
              [
                { key: "network", label: "Network", Icon: Network },
                { key: "inbox", label: "Inbox", Icon: InboxIcon },
                { key: "matches", label: "Matches", Icon: Heart },
                { key: "itineraries", label: "Itineraries", Icon: Map },
                { key: "profile", label: "Profile", Icon: User },
              ] as const
            ).map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={[
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-100",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
                  activeTab === key
                    ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50",
                ].join(" ")}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {activeTab === "network" && (
          <div key="network" className="animate-fade-in flex-1 flex flex-col">
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
          </div>
        )}

        {activeTab === "inbox" && (
          <div key="inbox" className="animate-fade-in max-w-7xl mx-auto px-4 py-8 w-full">
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

        {activeTab === "matches" && (
          <div key="matches" className="animate-fade-in max-w-7xl mx-auto px-4 py-8 w-full">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <MatchesList />
              <MatchMaker onMatchCreated={() => loadData()} />
            </div>
          </div>
        )}

        {activeTab === "itineraries" && (
          <div key="itineraries" className="animate-fade-in flex-1 relative">
            <ItineraryPlanner />
          </div>
        )}

        {activeTab === "profile" && userProfile && (
          <div key="profile" className="animate-fade-in max-w-7xl mx-auto px-4 py-8 w-full">
            {/* Hero Card */}
            <Card className="mb-6">
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
                          setEditForm({ ...editForm, profile_image_url: e.target.value })
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
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                        @{userProfile.username}
                      </p>
                      {userProfile.bio && (
                        <p className="text-sm text-gray-700 dark:text-gray-300 mb-4 max-w-2xl">
                          {userProfile.bio}
                        </p>
                      )}
                      <div className="flex items-center gap-4">
                        <button
                          onClick={() => setShowConnectionsModal(true)}
                          className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors hover:underline"
                        >
                          <span className="font-semibold">{connections.length}</span>{" "}
                          {connections.length === 1 ? "Connection" : "Connections"}
                        </button>
                        <span className="text-gray-300 dark:text-gray-700">·</span>
                        <button
                          onClick={() => setShowBlockedModal(true)}
                          className="text-sm text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors hover:underline"
                        >
                          {blockedUsers.length > 0 ? `${blockedUsers.length} blocked` : "Blocked users"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-3">
                      <Input
                        label="Full Name"
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        placeholder="Full Name"
                      />
                      <Input
                        label="Preferred Name"
                        value={editForm.preferred_name}
                        onChange={(e) => setEditForm({ ...editForm, preferred_name: e.target.value })}
                        placeholder="Preferred Name (optional)"
                      />
                      <Input
                        label="Username"
                        value={editForm.username}
                        onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                        placeholder="username"
                      />
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Bio</label>
                        <textarea
                          value={editForm.bio}
                          onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })}
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
                    <Button variant="secondary" size="md" onClick={handleEditProfile}>
                      Edit Profile
                    </Button>
                  ) : (
                    <>
                      <Button variant="primary" size="md" onClick={handleSaveProfile}>
                        Save
                      </Button>
                      <Button variant="secondary" size="md" onClick={handleCancelEdit}>
                        Cancel
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </Card>

            {/* Cards */}
            <div className="space-y-6">
              {/* About Card */}
              <Card>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">
                  About
                </h3>
                <div className="space-y-4">
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Email</p>
                    <p className="text-sm text-gray-900 dark:text-gray-100">{userProfile.email}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Gender</p>
                    {!isEditingProfile ? (
                      <p className="text-sm text-gray-900 dark:text-gray-100">
                        {userProfile.gender || <span className="text-gray-400 dark:text-gray-500">Not specified</span>}
                      </p>
                    ) : (
                      <Select
                        value={editForm.gender}
                        onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })}
                      >
                        <option value="">Prefer not to say</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Non-binary">Non-binary</option>
                        <option value="Other">Other</option>
                      </Select>
                    )}
                  </div>
                </div>
              </Card>

              {/* Social Links Card */}
              <Card>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">
                  Social Links
                </h3>

                {!isEditingProfile ? (
                  /* View mode: only show platforms that have links */
                  socialLinks.length === 0 ? (
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      No social links added yet.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {socialLinks.map((link) => {
                        const config = SOCIAL_PLATFORMS[link.platform];
                        const Icon = config?.icon;
                        const handle = link.url
                          .replace(/^https?:\/\//, "")
                          .replace(config?.baseUrl?.replace(/^https?:\/\//, "") || "", "")
                          .replace(config?.prefix || "", "")
                          .replace(/^\//, "");
                        return (
                          <a
                            key={link.id}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors group"
                          >
                            {Icon && (
                              <Icon className={`text-base flex-shrink-0 ${config.color}`} />
                            )}
                            <span className="text-sm text-gray-900 dark:text-gray-100 font-medium flex-shrink-0">
                              {link.platform}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400 truncate flex-1">
                              {handle || link.url}
                            </span>
                          </a>
                        );
                      })}
                    </div>
                  )
                ) : (
                  /* Edit mode: show all platforms as inputs */
                  <div className="space-y-3">
                    {Object.entries(SOCIAL_PLATFORMS).map(([key, config]) => {
                      const Icon = config.icon;
                      const existingLink = socialLinks.find((l) => l.platform === key);
                      return (
                        <div key={key} className="flex items-center gap-3">
                          <Icon className={`text-base flex-shrink-0 w-5 ${config.color}`} />
                          <div className="flex-1 flex items-center border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-transparent overflow-hidden">
                            <span className="px-3 py-2.5 text-xs text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700 whitespace-nowrap flex-shrink-0">
                              {config.prefix}
                            </span>
                            <input
                              type="text"
                              value={socialInputs[key] || ""}
                              onChange={(e) =>
                                setSocialInputs({ ...socialInputs, [key]: e.target.value })
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
        <div className="p-5">
          <ConnectionManager
            onOpenUser={(u) => {
              setSelectedConnectionUser(u);
              setShowSearchModal(false);
            }}
          />
        </div>
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
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">No blocked users</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">You haven&apos;t blocked anyone</p>
            </div>
          ) : (
            blockedUsers.map((blocked) => {
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
                  className="flex items-center justify-between p-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Avatar
                      name={blockedData.blocked_user.preferred_name || blockedData.blocked_user.name}
                      imageUrl={blockedData.blocked_user.profile_image_url}
                      size="sm"
                    />
                    <div>
                      <button
                        onClick={() => {
                          setSelectedConnectionUser({
                            id: blockedData.blocked_id,
                            username: blockedData.blocked_user.username || "",
                            name: blockedData.blocked_user.name,
                            preferred_name: blockedData.blocked_user.preferred_name,
                            profile_image_url: blockedData.blocked_user.profile_image_url,
                          });
                          setShowBlockedModal(false);
                        }}
                        className="text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors text-left"
                      >
                        {blockedData.blocked_user.preferred_name || blockedData.blocked_user.name}
                      </button>
                      <p className="text-xs text-red-500 dark:text-red-400">Blocked</p>
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
            placeholder="Search by name or username..."
          />
          <div className="flex gap-2">
            {(
              [
                { key: "all" as const, label: `All (${connectionUsers.length})` },
                {
                  key: "first" as const,
                  label: `1st (${connectionUsers.filter((u) => u.connection_type === "first").length})`,
                },
                {
                  key: "one_point_five" as const,
                  label: `1.5 (${connectionUsers.filter((u) => u.connection_type === "one_point_five").length})`,
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
              {connectionsSearch.trim() ? "No matches found" : "No connections yet"}
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
                      <span className="text-xs text-gray-500 dark:text-gray-400">@{u.username}</span>
                      {u.connection_type && (
                        <Badge variant={connectionTypeBadge(u.connection_type)} />
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
          onChanged={() => loadData()}
        />
      )}
    </div>
  );
}
