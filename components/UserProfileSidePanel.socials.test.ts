import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("user profile side panel socials", () => {
  it("renders bio and combines manual links with verified social rows", () => {
    const source = readFileSync("components/UserProfileSidePanel.tsx", "utf8");

    expect(source).toContain("profile.bio");
    expect(source).toContain("getVerifiedSocialRows");
    expect(source).toContain("socialRows");
    expect(source).toContain("Socials");
    expect(source).toContain("allLinkedSocialRows");
    expect(source).toContain("No socials linked yet.");
    expect(source).not.toContain("{allLinkedSocialRows.length > 0 && (");
  });

  it("uses separate sidebar tabs for socials and connection", () => {
    const source = readFileSync("components/UserProfileSidePanel.tsx", "utf8");

    expect(source).toContain("sidebarSection");
    expect(source).toContain('setSidebarSection("socials")');
    expect(source).toContain('setSidebarSection("connection")');
    expect(source).toContain('{sidebarSection === "socials" && (');
    expect(source).toContain('{sidebarSection === "connection" && (');
  });

  it("loads social verifications from the profile endpoint", () => {
    const source = readFileSync("app/api/profile/[id]/route.ts", "utf8");

    expect(source).toContain("socialVerifications");
    expect(source).toContain("verifications");
    expect(source).toContain("profile_url");
  });
});
