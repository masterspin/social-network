export function getProfilePatchUpdates(body: Record<string, unknown>) {
  const userUpdates: { name?: string | null } = {};
  const profileUpdates: {
    preferredName?: string | null;
    gender?: string | null;
    bio?: string | null;
    profileImageUrl?: string | null;
    updatedAt: Date;
  } = { updatedAt: new Date() };

  if ("name" in body) userUpdates.name = (body.name as string | null) ?? null;
  if ("preferred_name" in body) {
    profileUpdates.preferredName = (body.preferred_name as string | null) ?? null;
  }
  if ("gender" in body) profileUpdates.gender = (body.gender as string | null) ?? null;
  if ("bio" in body) profileUpdates.bio = (body.bio as string | null) ?? null;
  if ("profile_image_url" in body) {
    profileUpdates.profileImageUrl = (body.profile_image_url as string | null) ?? null;
  }

  return { userUpdates, profileUpdates };
}
