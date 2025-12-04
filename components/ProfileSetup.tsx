"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  FaInstagram,
  FaTwitter,
  FaLinkedin,
  FaFacebook,
  FaTiktok,
  FaDiscord,
  FaSnapchat,
  FaLink,
} from "react-icons/fa";
import {
  createUserProfile,
  updateUserProfile,
  getCurrentUser,
  addSocialLink,
  deleteSocialLink,
  getUserSocialLinks,
  checkUsernameAvailable,
} from "@/lib/supabase/queries";
import { Database } from "@/types/supabase";

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
    color: "text-teal-600 dark:text-teal-400",
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
    prefix: "",
    placeholder: "username#0000",
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

interface ProfileSetupProps {
  isEdit?: boolean;
  existingProfile?: Database["public"]["Tables"]["users"]["Row"];
}

export default function ProfileSetup({
  isEdit = false,
  existingProfile,
}: ProfileSetupProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 3; // Changed from 3 to 4

  const [name, setName] = useState(existingProfile?.name || "");
  const [username, setUsername] = useState(existingProfile?.username || "");
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(
    null
  );
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [preferredName, setPreferredName] = useState(
    existingProfile?.preferred_name || ""
  );
  const [gender, setGender] = useState(existingProfile?.gender || "");
  const [bio, setBio] = useState(existingProfile?.bio || "");
  const [profileImageUrl, setProfileImageUrl] = useState(
    existingProfile?.profile_image_url || ""
  );

  // Social links
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);

  // Social link inputs - store username/handle for each platform
  const [socialInputs, setSocialInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isEdit && existingProfile) {
      loadSocialLinks();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, existingProfile]);

  const loadSocialLinks = async () => {
    if (!existingProfile) return;
    const { data } = await getUserSocialLinks(existingProfile.id);
    if (data) {
      setSocialLinks(data);
      // Pre-populate socialInputs with existing links
      const inputs: Record<string, string> = {};
      (data as SocialLink[]).forEach((link) => {
        // Extract username from URL
        const platformConfig = SOCIAL_PLATFORMS[link.platform];
        if (platformConfig) {
          if (link.platform === "LinkedIn" && platformConfig.prefix) {
            // For LinkedIn, remove https:// and the prefix
            const username = link.url
              .replace("https://", "")
              .replace(platformConfig.prefix, "");
            inputs[link.platform] = username;
          } else if (platformConfig.baseUrl) {
            const username = link.url.replace(platformConfig.baseUrl, "");
            inputs[link.platform] = username;
          } else {
            inputs[link.platform] = link.url;
          }
        } else {
          inputs[link.platform] = link.url;
        }
      });
      setSocialInputs(inputs);
    }
  };

  const handleUsernameChange = async (value: string) => {
    setUsername(value);

    // Reset validation state if username is empty
    if (!value.trim()) {
      setUsernameAvailable(null);
      return;
    }

    // Don't check if it's the same as existing (for edit mode)
    if (isEdit && existingProfile?.username === value) {
      setUsernameAvailable(true);
      return;
    }

    // Validate format (alphanumeric, underscores, hyphens)
    const usernameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!usernameRegex.test(value)) {
      setUsernameAvailable(false);
      return;
    }

    // Check availability with debouncing
    setUsernameChecking(true);
    const { available } = await checkUsernameAvailable(value);
    setUsernameAvailable(available);
    setUsernameChecking(false);
  };

  const handleSocialInputChange = (platform: string, value: string) => {
    setSocialInputs((prev) => ({
      ...prev,
      [platform]: value,
    }));
  };

  const handleRemoveSocialLink = async (linkId: string) => {
    const { error } = await deleteSocialLink(linkId);
    if (error) {
      setError(error.message);
    } else {
      setSocialLinks(socialLinks.filter((link) => link.id !== linkId));
    }
  };

  const nextStep = () => {
    setError(null);
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    setError(null);
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleStepSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); // Clear previous errors

    // Validation for each step
    if (currentStep === 1) {
      if (!name.trim()) {
        setError("Name is required");
        return;
      }
      if (!username.trim()) {
        setError("Username is required");
        return;
      }

      // Validate username format
      const usernameRegex = /^[a-zA-Z0-9_-]+$/;
      if (!usernameRegex.test(username)) {
        setError(
          "Username can only contain letters, numbers, underscores, and hyphens"
        );
        return;
      }

      // Check if we need to validate username (skip if editing and username hasn't changed)
      const shouldSkipCheck = isEdit && existingProfile?.username === username;
      console.log("Username validation check:", {
        isEdit,
        existingUsername: existingProfile?.username,
        newUsername: username,
        shouldSkipCheck,
      });

      if (!shouldSkipCheck) {
        // Perform real-time check to ensure username is available
        setUsernameChecking(true);
        const result = await checkUsernameAvailable(username);
        setUsernameAvailable(result.available);
        setUsernameChecking(false);

        console.log("Step 1 username check result:", {
          username,
          result,
          available: result.available,
          error: result.error,
        });

        if (result.error) {
          setError("Error checking username availability. Please try again.");
          return;
        }

        if (!result.available) {
          setError(
            "This username is already taken. Please choose another one."
          );
          return;
        }
      }

      nextStep();
    } else if (currentStep === 2) {
      nextStep();
    } else if (currentStep === 3) {
      handleFinalSubmit();
    }
  };

  const handleFinalSubmit = async () => {
    setLoading(true);
    setError(null);

    const { user: authUser } = await getCurrentUser();
    if (!authUser) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }

    // Validate username format
    const usernameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!usernameRegex.test(username)) {
      setError(
        "Username can only contain letters, numbers, underscores, and hyphens"
      );
      setLoading(false);
      return;
    }

    // Check username availability (skip if editing and username hasn't changed)
    if (!(isEdit && existingProfile?.username === username)) {
      const result = await checkUsernameAvailable(username);

      console.log("Final submit username check:", result);

      if (!result.available) {
        setError("This username is already taken. Please choose another one.");
        setLoading(false);
        return;
      }
    }

    const profileData = {
      id: authUser.id,
      email: authUser.email || "",
      username,
      name,
      preferred_name: preferredName || null,
      gender: gender || null,
      bio: bio || null,
      profile_image_url: profileImageUrl || null,
    };

    let result;
    if (isEdit) {
      result = await updateUserProfile(authUser.id, profileData);
    } else {
      result = await createUserProfile(profileData);
    }

    if (result.error) {
      setError(result.error.message);
      setLoading(false);
    } else {
      // Handle social links for both wizard and edit mode
      if (isEdit) {
        // For edit mode: update/add/remove social links based on socialInputs
        for (const [platform, value] of Object.entries(socialInputs)) {
          const existingLink = socialLinks.find(
            (link) => link.platform === platform
          );

          if (value.trim()) {
            // User has entered a value
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

            if (existingLink) {
              // Update existing link if URL changed
              if (existingLink.url !== fullUrl) {
                await deleteSocialLink(existingLink.id);
                await addSocialLink({
                  user_id: authUser.id,
                  platform: platform,
                  url: fullUrl,
                });
              }
            } else {
              // Add new link
              await addSocialLink({
                user_id: authUser.id,
                platform: platform,
                url: fullUrl,
              });
            }
          } else if (existingLink) {
            // User cleared the value, remove the link
            await deleteSocialLink(existingLink.id);
          }
        }
      } else {
        // For wizard mode: save social links from socialInputs (only non-empty ones)
        for (const [platform, value] of Object.entries(socialInputs)) {
          if (value.trim()) {
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

            await addSocialLink({
              user_id: authUser.id,
              platform: platform,
              url: fullUrl,
            });
          }
        }
      }
      router.push("/");
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h2 className="text-3xl font-bold mb-6">
        {isEdit ? "Edit Profile" : "Set Up Your Profile"}
      </h2>

      {error && (
        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200 rounded">
          {error}
        </div>
      )}

      {/* Show full form for edit mode */}
      {isEdit ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);

            // Validate username format
            const usernameRegex = /^[a-zA-Z0-9_-]+$/;
            if (!usernameRegex.test(username)) {
              setError(
                "Username can only contain letters, numbers, underscores, and hyphens"
              );
              return;
            }

            // Check if username changed and validate availability
            if (existingProfile?.username !== username) {
              setUsernameChecking(true);
              const result = await checkUsernameAvailable(username);
              setUsernameAvailable(result.available);
              setUsernameChecking(false);

              if (!result.available) {
                setError(
                  "This username is already taken. Please choose another one."
                );
                return;
              }
            }

            handleFinalSubmit();
          }}
          className="space-y-6"
        >
          {/* Profile Summary Card */}
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
            <h3 className="text-xl font-semibold mb-4">Profile Summary</h3>
            <div className="grid md:grid-cols-2 gap-4">
              {/* Profile Image */}
              {profileImageUrl && (
                <div className="md:col-span-2 flex justify-center">
                  <Image
                    src={profileImageUrl}
                    alt="Profile"
                    width={96}
                    height={96}
                    className="w-24 h-24 rounded-full object-cover border-4 border-white dark:border-gray-700 shadow-lg"
                  />
                </div>
              )}

              {/* Name */}
              <div className="bg-white dark:bg-gray-800 p-3 rounded-lg">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                  Full Name
                </div>
                <div className="font-medium text-gray-900 dark:text-gray-100">
                  {name || "Not set"}
                </div>
              </div>

              {/* Preferred Name */}
              {preferredName && (
                <div className="bg-white dark:bg-gray-800 p-3 rounded-lg">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                    Preferred Name
                  </div>
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    {preferredName}
                  </div>
                </div>
              )}

              {/* Email */}
              <div className="bg-white dark:bg-gray-800 p-3 rounded-lg">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                  Email
                </div>
                <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
                  {existingProfile?.email || "Not set"}
                </div>
              </div>

              {/* Gender */}
              {gender && (
                <div className="bg-white dark:bg-gray-800 p-3 rounded-lg">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                    Gender
                  </div>
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    {gender}
                  </div>
                </div>
              )}

              {/* Bio */}
              {bio && (
                <div className="md:col-span-2 bg-white dark:bg-gray-800 p-3 rounded-lg">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                    Bio
                  </div>
                  <div className="text-sm text-gray-900 dark:text-gray-100">
                    {bio}
                  </div>
                </div>
              )}

              {/* Privacy Settings Summary */}
              {/* <div className="md:col-span-2 bg-white dark:bg-gray-800 p-3 rounded-lg">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  Privacy Settings
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-xs rounded-full">
                    Visible to {visibilityLevel} connection
                    {visibilityLevel !== 1 ? "s" : ""} away
                  </span>
                  {showProfileImage && (
                    <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-xs rounded-full">
                      ✓ Profile Image Public
                    </span>
                  )}
                  {showFullName && (
                    <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-xs rounded-full">
                      ✓ Full Name Public
                    </span>
                  )}
                  {showGender && (
                    <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-xs rounded-full">
                      ✓ Gender Public
                    </span>
                  )}
                  {showSocialLinks && (
                    <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-xs rounded-full">
                      ✓ Social Links Public
                    </span>
                  )}
                </div>
              </div> */}

              {/* Social Links Summary */}
              {socialLinks.length > 0 && (
                <div className="md:col-span-2 bg-white dark:bg-gray-800 p-3 rounded-lg">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                    Social Links ({socialLinks.length})
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {socialLinks.map((link) => {
                      const platformConfig = SOCIAL_PLATFORMS[link.platform];
                      const Icon = platformConfig?.icon || FaLink;
                      return (
                        <a
                          key={link.id}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition"
                          title={link.url}
                        >
                          <Icon
                            className={`text-sm ${
                              platformConfig?.color || "text-gray-600"
                            }`}
                          />
                          <span className="text-xs">{link.platform}</span>
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Basic Info */}
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
            <h3 className="text-xl font-semibold mb-4">Basic Information</h3>

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="name"
                  className="block text-sm font-medium mb-2"
                >
                  Full Name *
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="preferredName"
                  className="block text-sm font-medium mb-2"
                >
                  Preferred Name (optional)
                </label>
                <input
                  id="preferredName"
                  type="text"
                  value={preferredName}
                  onChange={(e) => setPreferredName(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
                />
              </div>

              <div>
                <label
                  htmlFor="gender"
                  className="block text-sm font-medium mb-2"
                >
                  Gender (optional)
                </label>
                <input
                  id="gender"
                  type="text"
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  placeholder="e.g., Male, Female, Non-binary, Prefer not to say"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
                />
              </div>

              <div>
                <label htmlFor="bio" className="block text-sm font-medium mb-2">
                  Bio (optional)
                </label>
                <textarea
                  id="bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
                />
              </div>

              <div>
                <label
                  htmlFor="profileImage"
                  className="block text-sm font-medium mb-2"
                >
                  Profile Image URL (optional)
                </label>
                <input
                  id="profileImage"
                  type="url"
                  value={profileImageUrl}
                  onChange={(e) => setProfileImageUrl(e.target.value)}
                  placeholder="https://example.com/image.jpg"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
                />
              </div>
            </div>
          </div>

          {/* Social Links */}
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
            <h3 className="text-xl font-semibold mb-4">Social Links</h3>

            {socialLinks.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <FaLink className="text-4xl mb-2 mx-auto opacity-50" />
                <p className="text-sm">No social links added yet</p>
              </div>
            ) : (
              <div className="space-y-3 mb-4">
                {socialLinks.map((link) => {
                  const platformConfig = SOCIAL_PLATFORMS[link.platform];
                  const Icon = platformConfig?.icon || FaLink;
                  return (
                    <div
                      key={link.id}
                      className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition group"
                    >
                      <Icon
                        className={`text-2xl ${
                          platformConfig?.color || "text-gray-600"
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">
                          {link.platform}
                        </div>
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gray-600 dark:text-gray-300 hover:underline text-sm truncate block"
                        >
                          {link.url}
                        </a>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveSocialLink(link.id)}
                        className="px-3 py-1 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition opacity-0 group-hover:opacity-100"
                      >
                        Remove
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="space-y-4 mt-4">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                Add or Update Social Links
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                {Object.entries(SOCIAL_PLATFORMS)
                  .filter(([key]) => key !== "LinkedIn")
                  .map(([key, config]) => {
                    const Icon = config.icon;

                    return (
                      <div key={key} className="relative">
                        <label className="block mb-1.5">
                          <div className="flex items-center gap-2 text-sm font-medium mb-1">
                            <Icon className={`text-lg ${config.color}`} />
                            <span>{config.name}</span>
                          </div>
                        </label>
                        <div className="relative flex items-center border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus-within:ring-2 focus-within:ring-gray-500 focus-within:border-transparent">
                          {config.prefix && (
                            <span className="px-3 text-gray-500 dark:text-gray-400 font-medium border-r border-gray-300 dark:border-gray-600">
                              {config.prefix}
                            </span>
                          )}
                          <input
                            type="text"
                            value={socialInputs[key] || ""}
                            onChange={(e) =>
                              handleSocialInputChange(key, e.target.value)
                            }
                            placeholder={config.placeholder}
                            className="flex-1 px-3 py-2.5 text-sm bg-transparent border-0 focus:outline-none focus:ring-0"
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* LinkedIn full width at bottom */}
              {SOCIAL_PLATFORMS.LinkedIn && (
                <div className="relative">
                  <label className="block mb-1.5">
                    <div className="flex items-center gap-2 text-sm font-medium mb-1">
                      <FaLinkedin
                        className={`text-lg ${SOCIAL_PLATFORMS.LinkedIn.color}`}
                      />
                      <span>{SOCIAL_PLATFORMS.LinkedIn.name}</span>
                    </div>
                  </label>
                  <div className="relative flex items-center border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus-within:ring-2 focus-within:ring-gray-500 focus-within:border-transparent">
                    <span className="px-3 text-gray-500 dark:text-gray-400 text-sm border-r border-gray-300 dark:border-gray-600">
                      {SOCIAL_PLATFORMS.LinkedIn.prefix}
                    </span>
                    <input
                      type="text"
                      value={socialInputs.LinkedIn || ""}
                      onChange={(e) =>
                        handleSocialInputChange("LinkedIn", e.target.value)
                      }
                      placeholder={SOCIAL_PLATFORMS.LinkedIn.placeholder}
                      className="flex-1 px-3 py-2.5 text-sm bg-transparent border-0 focus:outline-none focus:ring-0"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-gray-200 text-white dark:text-gray-900 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {loading ? "Saving..." : "Update Profile"}
          </button>
        </form>
      ) : (
        /* Step-by-step wizard for new profile creation */
        <>
          {/* Progress indicator */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              {[1, 2, 3].map((step) => (
                <div key={step} className="flex items-center flex-1">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center font-medium ${
                      step === currentStep
                        ? "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900"
                        : step < currentStep
                        ? "bg-gray-700 dark:bg-gray-300 text-white dark:text-gray-900"
                        : "bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-300"
                    }`}
                  >
                    {step < currentStep ? "✓" : step}
                  </div>
                  {step < 3 && (
                    <div
                      className={`flex-1 h-1 mx-32 ${
                        step < currentStep
                          ? "bg-gray-700 dark:bg-gray-300"
                          : "bg-gray-300 dark:bg-gray-600"
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mt-2">
              <span>Basic Info</span>
              <span>Details</span>
              <span>Social Links</span>
              {/* <span>Privacy</span> */}
            </div>
          </div>

          <form onSubmit={handleStepSubmit} className="space-y-6">
            {/* Step 1: Basic Info */}
            {currentStep === 1 && (
              <div className="bg-white dark:bg-gray-900 p-8 rounded-2xl shadow-2xl border-0">
                <h3 className="text-2xl font-bold mb-2">
                  Let&apos;s start with your name
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                  This is how you&apos;ll appear to others in your network
                </p>

                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="name"
                      className="block text-sm font-medium mb-2"
                    >
                      Full Name *
                    </label>
                    <input
                      id="name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-4 py-3 text-lg border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-gray-500 focus:border-transparent bg-white dark:bg-gray-700 transition-all"
                      placeholder="Enter your full name"
                      required
                      autoFocus
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="username"
                      className="block text-sm font-medium mb-2"
                    >
                      Username *
                    </label>
                    <div className="relative">
                      <input
                        id="username"
                        type="text"
                        value={username}
                        onChange={(e) => handleUsernameChange(e.target.value)}
                        className={`w-full px-4 py-3 text-lg border ${
                          usernameAvailable === false
                            ? "border-red-500"
                            : usernameAvailable === true
                            ? "border-green-500"
                            : "border-gray-300 dark:border-gray-600"
                        } rounded-xl focus:ring-2 focus:ring-gray-500 focus:border-transparent bg-white dark:bg-gray-700 transition-all`}
                        placeholder="Choose a unique username"
                        required
                      />
                      {usernameChecking && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                          Checking...
                        </span>
                      )}
                      {usernameAvailable === false && !usernameChecking && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-red-500">
                          ✗ Not available
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Letters, numbers, underscores, and hyphens only
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="preferredName"
                      className="block text-sm font-medium mb-2"
                    >
                      Preferred Name (optional)
                    </label>
                    <input
                      id="preferredName"
                      type="text"
                      value={preferredName}
                      onChange={(e) => setPreferredName(e.target.value)}
                      className="w-full px-4 py-3 text-lg border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-gray-500 focus:border-transparent bg-white dark:bg-gray-700 transition-all"
                      placeholder="What should we call you?"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Additional Details */}
            {currentStep === 2 && (
              <div className="bg-white dark:bg-gray-900 p-8 rounded-2xl shadow-2xl border-0">
                <h3 className="text-2xl font-bold mb-2">
                  Tell us more about yourself
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                  Help others get to know you better
                </p>

                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="gender"
                      className="block text-sm font-medium mb-2"
                    >
                      Gender (optional)
                    </label>
                    <input
                      id="gender"
                      type="text"
                      value={gender}
                      onChange={(e) => setGender(e.target.value)}
                      placeholder="e.g., Male, Female, Non-binary, Prefer not to say"
                      className="w-full px-4 py-3 text-lg border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-gray-500 focus:border-transparent bg-white dark:bg-gray-700 transition-all"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="bio"
                      className="block text-sm font-medium mb-2"
                    >
                      Bio (optional)
                    </label>
                    <textarea
                      id="bio"
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      rows={4}
                      placeholder="Tell others about yourself..."
                      className="w-full px-4 py-3 text-lg border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-gray-500 focus:border-transparent bg-white dark:bg-gray-700 transition-all"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="profileImage"
                      className="block text-sm font-medium mb-2"
                    >
                      Profile Image URL (optional)
                    </label>
                    <input
                      id="profileImage"
                      type="url"
                      value={profileImageUrl}
                      onChange={(e) => setProfileImageUrl(e.target.value)}
                      placeholder="https://example.com/image.jpg"
                      className="w-full px-4 py-3 text-lg border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-gray-500 focus:border-transparent bg-white dark:bg-gray-700 transition-all"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Social Links */}
            {currentStep === 3 && (
              <div className="bg-white dark:bg-gray-900 p-8 rounded-2xl shadow-2xl border-0">
                <h3 className="text-2xl font-bold mb-2">
                  Add your social links
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                  Optional - Enter your username/handle for each platform
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                  {Object.entries(SOCIAL_PLATFORMS)
                    .filter(([key]) => key !== "LinkedIn")
                    .map(([key, config]) => {
                      const Icon = config.icon;
                      return (
                        <div key={key} className="relative">
                          <label className="block mb-1.5">
                            <div className="flex items-center gap-2 text-sm font-medium mb-1">
                              <Icon className={`text-lg ${config.color}`} />
                              <span>{config.name}</span>
                            </div>
                          </label>
                          <div className="relative flex items-center border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus-within:ring-2 focus-within:ring-gray-500 focus-within:border-transparent">
                            {config.prefix && (
                              <span className="px-3 text-gray-500 dark:text-gray-400 font-medium border-r border-gray-300 dark:border-gray-600">
                                {config.prefix}
                              </span>
                            )}
                            <input
                              type="text"
                              value={socialInputs[key] || ""}
                              onChange={(e) =>
                                handleSocialInputChange(key, e.target.value)
                              }
                              placeholder={config.placeholder}
                              className="flex-1 px-3 py-2.5 text-sm bg-transparent border-0 focus:outline-none focus:ring-0"
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>

                {/* LinkedIn full width at bottom */}
                {SOCIAL_PLATFORMS.LinkedIn && (
                  <div className="relative">
                    <label className="block mb-1.5">
                      <div className="flex items-center gap-2 text-sm font-medium mb-1">
                        <FaLinkedin
                          className={`text-lg ${SOCIAL_PLATFORMS.LinkedIn.color}`}
                        />
                        <span>{SOCIAL_PLATFORMS.LinkedIn.name}</span>
                      </div>
                    </label>
                    <div className="relative flex items-center border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus-within:ring-2 focus-within:ring-gray-500 focus-within:border-transparent">
                      <span className="px-3 text-gray-500 dark:text-gray-400 text-sm border-r border-gray-300 dark:border-gray-600">
                        {SOCIAL_PLATFORMS.LinkedIn.prefix}
                      </span>
                      <input
                        type="text"
                        value={socialInputs.LinkedIn || ""}
                        onChange={(e) =>
                          handleSocialInputChange("LinkedIn", e.target.value)
                        }
                        placeholder={SOCIAL_PLATFORMS.LinkedIn.placeholder}
                        className="flex-1 px-3 py-2.5 text-sm bg-transparent border-0 focus:outline-none focus:ring-0"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 4: Privacy Settings */}
            {/* {currentStep === 4 && (
              <div className="bg-white dark:bg-gray-900 p-8 rounded-2xl shadow-2xl border-0">
                <h3 className="text-2xl font-bold mb-2">
                  Choose your privacy settings
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                  Control who can see your profile and information
                </p>

                <div className="space-y-6">
                  <div>
                    <label
                      htmlFor="visibility"
                      className="block text-sm font-medium mb-3"
                    >
                      Visibility Level: {visibilityLevel}{" "}
                      {visibilityLevel === 1 ? "connection" : "connections"}{" "}
                      away
                    </label>
                    <input
                      id="visibility"
                      type="range"
                      min="1"
                      max="6"
                      value={visibilityLevel}
                      onChange={(e) =>
                        setVisibilityLevel(Number(e.target.value))
                      }
                      className="w-full h-2"
                    />
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                      Users beyond this distance will see limited information
                    </p>
                  </div>

                  <div className="space-y-3">
                    <p className="text-sm font-medium mb-2">
                      Show to distant connections:
                    </p>
                    <label className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showProfileImage}
                        onChange={(e) => setShowProfileImage(e.target.checked)}
                        className="w-5 h-5"
                      />
                      <span className="text-sm">Profile image</span>
                    </label>

                    <label className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showFullName}
                        onChange={(e) => setShowFullName(e.target.checked)}
                        className="w-5 h-5"
                      />
                      <span className="text-sm">Full name</span>
                    </label>

                    <label className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showGender}
                        onChange={(e) => setShowGender(e.target.checked)}
                        className="w-5 h-5"
                      />
                      <span className="text-sm">Gender</span>
                    </label>

                    <label className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showSocialLinks}
                        onChange={(e) => setShowSocialLinks(e.target.checked)}
                        className="w-5 h-5"
                      />
                      <span className="text-sm">Social links</span>
                    </label>
                  </div>
                </div>
              </div>
            )} */}

            {/* Navigation buttons */}
            <div className="flex gap-3">
              {currentStep > 1 && (
                <button
                  type="button"
                  onClick={prevStep}
                  className="px-6 py-3 border border-gray-300 dark:border-gray-600 rounded-lg font-medium hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                >
                  Back
                </button>
              )}

              {currentStep < totalSteps ? (
                <button
                  type="submit"
                  className="flex-1 py-3 px-4 bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-gray-200 text-white dark:text-gray-900 rounded-lg font-medium transition"
                >
                  Next
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-3 px-4 bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-gray-200 text-white dark:text-gray-900 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {loading ? "Creating Profile..." : "Complete Setup"}
                </button>
              )}
            </div>
          </form>
        </>
      )}
    </div>
  );
}
