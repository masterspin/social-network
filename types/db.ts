export type UserRow = {
  id: string;
  name: string;
  email: string;
  preferred_name: string | null;
  bio: string | null;
  profile_image_url: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type SocialLinkRow = {
  id: string;
  user_id: string;
  platform: string;
  url: string;
  created_at: string | null;
};

export type ConnectionRow = {
  id: string;
  requester_id: string;
  recipient_id: string;
  how_met: string;
  status: string | null;
  connection_type: string | null;
  upgrade_requested_type: string | null;
  upgrade_requested_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};
