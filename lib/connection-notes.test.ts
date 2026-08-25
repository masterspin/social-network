import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("private connection notes", () => {
  it("has a migration and route for per-user connection notes", () => {
    const migration = readFileSync(
      "drizzle/0005_add_connection_notes.sql",
      "utf8",
    );
    const route = readFileSync("app/api/connection-notes/route.ts", "utf8");

    expect(migration).toContain('"connection_notes"');
    expect(migration).toContain('"connection_id"');
    expect(migration).toContain('"user_id"');
    expect(migration).toContain('"description"');
    expect(migration).toContain('"year"');
    expect(route).toContain("connectionNotes");
    expect(route).toContain("onConflictDoUpdate");
  });

  it("stores connection type privately with notes", () => {
    const schema = readFileSync("lib/db/schema.ts", "utf8");
    const migration = readFileSync(
      "drizzle/0009_private_directional_connection_types.sql",
      "utf8",
    );
    const route = readFileSync("app/api/connection-notes/route.ts", "utf8");

    expect(schema).toContain('connectionType: connectionType("connection_type")');
    expect(migration).toContain('"connection_type"');
    expect(route).toContain("connection_type");
  });

  it("sidebar saves description and year as private notes instead of amendments", () => {
    const sidebar = readFileSync("components/UserProfileSidePanel.tsx", "utf8");

    expect(sidebar).toContain("privateNote");
    expect(sidebar).toContain("saveConnectionNote");
    expect(sidebar).toContain("/api/connection-notes");
    expect(sidebar).not.toContain("Description:");
  });

  it("list endpoints do not expose another user's shared how_met value", () => {
    const acceptedRoute = readFileSync(
      "app/api/connections/accepted/route.ts",
      "utf8",
    );
    const pendingRoute = readFileSync(
      "app/api/connections/pending/route.ts",
      "utf8",
    );

    expect(acceptedRoute).toContain("connectionNotes");
    expect(acceptedRoute).toContain("note?.description");
    expect(acceptedRoute).not.toContain("how_met: c.howMet");
    expect(pendingRoute).toContain('how_met: ""');
    expect(pendingRoute).not.toContain("how_met: row.howMet");
  });
});
