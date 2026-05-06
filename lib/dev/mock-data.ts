// Mock data for dev mode (NEXT_PUBLIC_DEV_MODE=true).
// All IDs use the 00000000-0000-0000-0000-00000000000X pattern so they're easy to spot.

export const DEV_USER_ID = "00000000-0000-0000-0000-000000000001";

export const DEV_USER = {
  id: DEV_USER_ID,
  email: "dev@example.com",
  username: "devuser",
  name: "Dev User",
  preferred_name: "Dev",
  gender: "Prefer not to say",
  bio: "Mock dev account — explore the app freely without a real login.",
  profile_image_url: null,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

const ALICE = {
  id: "00000000-0000-0000-0000-000000000002",
  username: "alice_chen",
  name: "Alice Chen",
  preferred_name: "Alice",
  profile_image_url: null,
  email: "alice@example.com",
  bio: "Product designer based in SF.",
  gender: "Woman",
  created_at: "2024-01-05T00:00:00Z",
  updated_at: "2024-01-05T00:00:00Z",
};

const BOB = {
  id: "00000000-0000-0000-0000-000000000003",
  username: "bmartin",
  name: "Bob Martinez",
  preferred_name: "Bob",
  profile_image_url: null,
  email: "bob@example.com",
  bio: "Software engineer. Coffee enthusiast.",
  gender: "Man",
  created_at: "2024-01-10T00:00:00Z",
  updated_at: "2024-01-10T00:00:00Z",
};

const CAROL = {
  id: "00000000-0000-0000-0000-000000000004",
  username: "carolkim",
  name: "Carol Kim",
  preferred_name: "Carol",
  profile_image_url: null,
  email: "carol@example.com",
  bio: "VC at Sequoia. Traveler.",
  gender: "Woman",
  created_at: "2024-02-01T00:00:00Z",
  updated_at: "2024-02-01T00:00:00Z",
};

const DAVID = {
  id: "00000000-0000-0000-0000-000000000005",
  username: "dpatel",
  name: "David Patel",
  preferred_name: "David",
  profile_image_url: null,
  email: "david@example.com",
  bio: "Startup founder. Dog dad.",
  gender: "Man",
  created_at: "2024-02-15T00:00:00Z",
  updated_at: "2024-02-15T00:00:00Z",
};

export const MOCK_USERS = [DEV_USER, ALICE, BOB, CAROL, DAVID];

// Full connection rows (with requester/recipient joined user objects)
// Matches the shape returned by getUserConnections and getConnectionBetweenUsers
const makeConn = (
  id: string,
  requester: typeof DEV_USER,
  recipient: typeof ALICE,
  how_met: string,
  type: "first" | "one_point_five",
  createdAt: string
) => ({
  id,
  requester_id: requester.id,
  recipient_id: recipient.id,
  how_met,
  status: "accepted" as const,
  connection_type: type,
  upgrade_requested_type: null,
  upgrade_requested_by: null,
  created_at: createdAt,
  updated_at: createdAt,
  requester: {
    id: requester.id,
    username: requester.username,
    name: requester.name,
    preferred_name: requester.preferred_name,
    profile_image_url: requester.profile_image_url,
  },
  recipient: {
    id: recipient.id,
    username: recipient.username,
    name: recipient.name,
    preferred_name: recipient.preferred_name,
    profile_image_url: recipient.profile_image_url,
  },
});

export const CONN_DEV_ALICE = makeConn(
  "00000000-0000-0000-0001-000000000001",
  DEV_USER, ALICE,
  "Met at a design conference in Austin (Year: 2023)",
  "first",
  "2024-01-15T00:00:00Z"
);

export const CONN_DEV_BOB = makeConn(
  "00000000-0000-0000-0001-000000000002",
  DEV_USER, BOB,
  "College roommates sophomore year (Year: 2019)",
  "first",
  "2024-01-20T00:00:00Z"
);

export const CONN_DEV_CAROL = makeConn(
  "00000000-0000-0000-0001-000000000003",
  DEV_USER, CAROL,
  "Connected through mutual friend Alice (Year: 2023)",
  "one_point_five",
  "2024-02-10T00:00:00Z"
);

export const CONN_DEV_DAVID = makeConn(
  "00000000-0000-0000-0001-000000000004",
  DEV_USER, DAVID,
  "Met at a startup demo day (Year: 2024)",
  "first",
  "2024-03-01T00:00:00Z"
);

// Alice and Bob are also connected (gives dev+alice a mutual of bob, and dev+bob a mutual of alice)
export const CONN_ALICE_BOB = makeConn(
  "00000000-0000-0000-0001-000000000005",
  ALICE, BOB,
  "Co-workers at a previous company",
  "first",
  "2023-06-01T00:00:00Z"
);

export const MOCK_CONNECTIONS = [CONN_DEV_ALICE, CONN_DEV_BOB, CONN_DEV_CAROL, CONN_DEV_DAVID];

// Shape returned by /api/connections/accepted
export const MOCK_ACCEPTED_CONNECTIONS = [
  {
    id: CONN_DEV_ALICE.id,
    how_met: CONN_DEV_ALICE.how_met,
    status: "accepted",
    connection_type: "first" as const,
    other_user: CONN_DEV_ALICE.recipient,
    mutualCount: 1, // bob is mutual
  },
  {
    id: CONN_DEV_BOB.id,
    how_met: CONN_DEV_BOB.how_met,
    status: "accepted",
    connection_type: "first" as const,
    other_user: CONN_DEV_BOB.recipient,
    mutualCount: 1, // alice is mutual
  },
  {
    id: CONN_DEV_CAROL.id,
    how_met: CONN_DEV_CAROL.how_met,
    status: "accepted",
    connection_type: "one_point_five" as const,
    other_user: CONN_DEV_CAROL.recipient,
    mutualCount: 0,
  },
  {
    id: CONN_DEV_DAVID.id,
    how_met: CONN_DEV_DAVID.how_met,
    status: "accepted",
    connection_type: "first" as const,
    other_user: CONN_DEV_DAVID.recipient,
    mutualCount: 0,
  },
];

// Social links for the dev user
export const MOCK_SOCIAL_LINKS = [
  {
    id: "00000000-0000-0000-0002-000000000001",
    user_id: DEV_USER_ID,
    platform: "Instagram",
    url: "https://instagram.com/devuser",
    created_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "00000000-0000-0000-0002-000000000002",
    user_id: DEV_USER_ID,
    platform: "Twitter",
    url: "https://twitter.com/devuser",
    created_at: "2024-01-01T00:00:00Z",
  },
];

// Matches — dev user is a participant (user1 or user2), not just matchmaker
// Match 1: Alice matched dev with Bob
// Match 2: David matched dev with Alice
export const MOCK_MATCHES = [
  {
    id: "00000000-0000-0000-0003-000000000001",
    matchmaker: {
      id: ALICE.id,
      username: ALICE.username,
      name: ALICE.name,
      preferred_name: ALICE.preferred_name,
      profile_image_url: ALICE.profile_image_url,
    },
    other_user: {
      id: BOB.id,
      username: BOB.username,
      name: BOB.name,
      preferred_name: BOB.preferred_name,
      profile_image_url: BOB.profile_image_url,
    },
    is_active: true,
    deleted_at: null,
    created_at: "2024-03-10T00:00:00Z",
  },
  {
    id: "00000000-0000-0000-0003-000000000002",
    matchmaker: {
      id: DAVID.id,
      username: DAVID.username,
      name: DAVID.name,
      preferred_name: DAVID.preferred_name,
      profile_image_url: DAVID.profile_image_url,
    },
    other_user: {
      id: ALICE.id,
      username: ALICE.username,
      name: ALICE.name,
      preferred_name: ALICE.preferred_name,
      profile_image_url: ALICE.profile_image_url,
    },
    is_active: true,
    deleted_at: null,
    created_at: "2024-04-01T00:00:00Z",
  },
];

// Itineraries
export const MOCK_ITINERARIES = [
  {
    id: "00000000-0000-0000-0004-000000000001",
    owner_id: DEV_USER_ID,
    title: "Tokyo Spring 2024",
    description: "Cherry blossom season trip with Alice and Bob.",
    summary: "A week exploring Tokyo during hanami season — Shinjuku Gyoen, Asakusa, teamLab.",
    start_date: "2024-04-01T00:00:00Z",
    end_date: "2024-04-08T00:00:00Z",
    timezone: "Asia/Tokyo",
    visibility: "shared",
    visibility_detail: "first_connection",
    status: "completed",
    cover_image_url: null,
    created_at: "2024-02-01T00:00:00Z",
    updated_at: "2024-04-08T00:00:00Z",
    owner: {
      id: DEV_USER_ID,
      username: DEV_USER.username,
      name: DEV_USER.name,
      preferred_name: DEV_USER.preferred_name,
      profile_image_url: DEV_USER.profile_image_url,
    },
    travelers: [
      {
        id: "00000000-0000-0000-0005-000000000001",
        user_id: ALICE.id,
        email: null,
        role: "traveler",
        invitation_status: "accepted",
        notifications_enabled: true,
        color_hex: "#6366f1",
      },
      {
        id: "00000000-0000-0000-0005-000000000002",
        user_id: BOB.id,
        email: null,
        role: "traveler",
        invitation_status: "accepted",
        notifications_enabled: true,
        color_hex: "#10b981",
      },
    ],
  },
  {
    id: "00000000-0000-0000-0004-000000000002",
    owner_id: DEV_USER_ID,
    title: "Paris Summer 2025",
    description: "Solo trip to Paris for a work conference and sightseeing.",
    summary: null,
    start_date: "2025-07-14T00:00:00Z",
    end_date: "2025-07-21T00:00:00Z",
    timezone: "Europe/Paris",
    visibility: "private",
    visibility_detail: "private",
    status: "planning",
    cover_image_url: null,
    created_at: "2025-03-01T00:00:00Z",
    updated_at: "2025-03-01T00:00:00Z",
    owner: {
      id: DEV_USER_ID,
      username: DEV_USER.username,
      name: DEV_USER.name,
      preferred_name: DEV_USER.preferred_name,
      profile_image_url: DEV_USER.profile_image_url,
    },
    travelers: [],
  },
];

// Minimal user shape for /api/users-all
export const MOCK_USERS_ALL = MOCK_USERS.map((u) => ({
  id: u.id,
  username: u.username,
  name: u.name,
  preferred_name: u.preferred_name,
  profile_image_url: u.profile_image_url,
}));
