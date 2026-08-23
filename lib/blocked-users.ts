type BlockedRow = {
  id: string;
  blocker_id: string;
  blocked_id: string;
  created_at: unknown;
};

type BlockedUserRow = {
  id: string;
  name: string | null;
  preferred_name: string | null;
  profile_image_url: string | null;
};

export function mapBlockedUsers({
  rows,
  users,
}: {
  rows: BlockedRow[];
  users: BlockedUserRow[];
}) {
  const usersById = new Map(users.map((user) => [user.id, user]));

  return rows.map((row) => {
    const user = usersById.get(row.blocked_id);

    return {
      ...row,
      blocked_user: {
        name: user?.name ?? "Unknown user",
        preferred_name: user?.preferred_name ?? null,
        profile_image_url: user?.profile_image_url ?? null,
      },
    };
  });
}
