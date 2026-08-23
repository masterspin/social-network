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

  it("keeps private notes collapsed until edit is clicked", () => {
    const source = readFileSync("components/UserProfileSidePanel.tsx", "utf8");

    expect(source).toContain("noteEditMode");
    expect(source).toContain('aria-label="Edit private note"');
    expect(source).toContain('aria-label="Save private note"');
    expect(source).toContain("Check");
    expect(source).not.toContain("No private note yet.");
    expect(source).not.toContain("Save note");
  });

  it("puts connection actions behind a three-dot menu", () => {
    const source = readFileSync("components/UserProfileSidePanel.tsx", "utf8");

    expect(source).toContain("MoreHorizontal");
    expect(source).toContain('aria-label="Connection actions"');
    expect(source).toContain("actionsOpen");
    expect(source).toContain("Downgrade to Weak");
    expect(source).toContain("Block User");
    expect(source).not.toContain("Manage Connection Type");
    expect(source).not.toContain('className="flex-1"\\n                                  onClick={handleRemoveConnection}');
  });

  it("confirms menu actions before changing connection state", () => {
    const source = readFileSync("components/UserProfileSidePanel.tsx", "utf8");

    expect(source).toContain('confirm("Downgrade this connection to Weak?")');
    expect(source).toContain('confirm("Request to upgrade this connection to Strong?")');
    expect(source).toContain('confirm("Remove this connection? This cannot be undone.")');
    expect(source).toContain("Block this user?");
  });
});
