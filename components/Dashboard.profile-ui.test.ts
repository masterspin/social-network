import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("dashboard profile UI", () => {
  it("does not render the removed About or Gender profile fields", () => {
    const source = readFileSync("components/Dashboard.tsx", "utf8");

    expect(source).not.toContain("About Card");
    expect(source).not.toContain(">About<");
    expect(source).not.toContain('label="Gender"');
    expect(source).not.toContain(">Gender<");
    expect(source).not.toContain("gender: editForm.gender");
  });
});
