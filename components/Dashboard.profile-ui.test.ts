import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("dashboard profile UI", () => {
  it("does not render the removed About or Gender profile fields", () => {
    const source = readFileSync("components/Dashboard.tsx", "utf8");

    expect(source).not.toContain("About Card");
    expect(source).not.toContain('label="Gender"');
    expect(source).not.toContain(">Gender<");
    expect(source).not.toContain("gender: editForm.gender");
  });

  it("does not keep blocked users in the profile dropdown", () => {
    const source = readFileSync("components/Dashboard.tsx", "utf8");

    expect(source).not.toContain("ShieldOff");
    expect(source).not.toContain(">Blocked Users<");
  });

  it("shows blocked count from the About section only when non-zero", () => {
    const source = readFileSync("components/Dashboard.tsx", "utf8");

    expect(source).toContain("blockedUsers.length > 0");
    expect(source).toContain("setShowBlockedModal(true)");
    expect(source).toContain("blocked");
  });

  it("uses profile sub-tabs for About and Socials sections", () => {
    const source = readFileSync("components/Dashboard.tsx", "utf8");

    expect(source).toContain("profileSection");
    expect(source).toContain('setProfileSection("about")');
    expect(source).toContain('setProfileSection("socials")');
    expect(source).toContain("About");
    expect(source).toContain("Socials");
  });

  it("shows the about card only when the About tab is selected", () => {
    const source = readFileSync("components/Dashboard.tsx", "utf8");

    expect(source).toContain('{profileSection === "about" && (');
    expect(source).toContain('{profileSection === "socials" && (');
    expect(source).toContain("Edit profile");
  });

  it("edits socials independently with a pencil button", () => {
    const source = readFileSync("components/Dashboard.tsx", "utf8");

    expect(source).toContain("isEditingSocials");
    expect(source).toContain("setIsEditingSocials(true)");
    expect(source).toContain("Pencil");
    expect(source).toContain("Edit socials");
  });

  it("uses icons for profile edit, save, and cancel actions", () => {
    const source = readFileSync("components/Dashboard.tsx", "utf8");

    expect(source).toContain("Pencil");
    expect(source).toContain("Check");
    expect(source).toContain("X");
    expect(source).toContain("Save profile");
    expect(source).toContain("Cancel profile edit");
  });
});
