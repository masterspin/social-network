import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { toClientConnectionRow } from "./connection-shape";

describe("connection API shape", () => {
  it("maps database camelCase connection fields to client snake_case fields", () => {
    const row = toClientConnectionRow({
      id: "connection-1",
      requesterId: "me",
      recipientId: "them",
      howMet: "school",
      status: "pending",
      connectionType: "first",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: null,
    });

    expect(row.requester_id).toBe("me");
    expect(row.recipient_id).toBe("them");
    expect(row.how_met).toBe("school");
    expect(row.connection_type).toBe("first");
    expect(row.created_at).toBe("2026-01-01T00:00:00.000Z");
  });

  it("is used by profile and inbox connection endpoints", () => {
    const connectionRoute = readFileSync("app/api/connection/route.ts", "utf8");
    const inboxRoute = readFileSync("app/api/inbox/route.ts", "utf8");

    expect(connectionRoute).toContain("toClientConnectionRow");
    expect(inboxRoute).toContain("toClientConnectionRow");
  });
});
