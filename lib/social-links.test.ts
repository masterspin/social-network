import { describe, expect, it } from "vitest";
import {
  getInitialDashboardTab,
  getSocialLinkEntryMode,
  getVerifiedSocialRows,
} from "./social-links";

describe("social link entry mode", () => {
  it("uses provider sign-in for LinkedIn and Discord", () => {
    expect(getSocialLinkEntryMode("LinkedIn")).toBe("verified-sign-in");
    expect(getSocialLinkEntryMode("Discord")).toBe("verified-sign-in");
  });

  it("uses manual entry for platforms without login verification", () => {
    expect(getSocialLinkEntryMode("Instagram")).toBe("manual");
    expect(getSocialLinkEntryMode("Twitter")).toBe("manual");
  });

  it("opens the profile tab from the callback URL", () => {
    expect(getInitialDashboardTab("?tab=profile")).toBe("profile");
    expect(getInitialDashboardTab("?tab=network")).toBe("network");
    expect(getInitialDashboardTab("")).toBe("network");
  });

  it("shows verified providers without manually saved links", () => {
    const rows = getVerifiedSocialRows({
      links: [],
      verifications: [
        {
          provider: "linkedin",
          provider_account_id: "li_123",
          display_name: "Ritij",
          profile_url: null,
        },
        {
          provider: "discord",
          provider_account_id: "discord_123",
          display_name: null,
          profile_url: "https://discord.com/users/discord_123",
        },
      ],
    });

    expect(rows).toEqual([
      {
        platform: "LinkedIn",
        label: "Ritij",
        url: null,
        verified: true,
      },
      {
        platform: "Discord",
        label: "discord_123",
        url: "https://discord.com/users/discord_123",
        verified: true,
      },
    ]);
  });
});
