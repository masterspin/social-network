import { describe, expect, it } from "vitest";
import { mapBlockedUsers } from "./blocked-users";

describe("blocked users", () => {
  it("adds blocked_user details to each blocked row", () => {
    expect(
      mapBlockedUsers({
        rows: [
          {
            id: "block-1",
            blocker_id: "me",
            blocked_id: "them",
            created_at: "2026-01-01",
          },
        ],
        users: [
          {
            id: "them",
            name: "Them",
            preferred_name: "T",
            profile_image_url: "https://example.com/them.png",
          },
        ],
      }),
    ).toEqual([
      {
        id: "block-1",
        blocker_id: "me",
        blocked_id: "them",
        created_at: "2026-01-01",
        blocked_user: {
          name: "Them",
          preferred_name: "T",
          profile_image_url: "https://example.com/them.png",
        },
      },
    ]);
  });
});
