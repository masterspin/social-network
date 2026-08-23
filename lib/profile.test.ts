import { describe, expect, it } from "vitest";
import { getProfilePatchUpdates } from "./profile";

describe("profile patch updates", () => {
  it("maps bio from the request body into profile updates", () => {
    const updates = getProfilePatchUpdates({
      name: "Ritij",
      preferred_name: "RJ",
      bio: "hello world",
      profile_image_url: "https://example.com/me.png",
    });

    expect(updates).toMatchObject({
      userUpdates: { name: "Ritij" },
      profileUpdates: {
        preferredName: "RJ",
        bio: "hello world",
        profileImageUrl: "https://example.com/me.png",
      },
    });
    expect(updates.profileUpdates.updatedAt).toBeInstanceOf(Date);
  });
});
