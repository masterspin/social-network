# Supabase to Auth.js + Neon Postgres Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Supabase from the app and run authentication through Auth.js with Google OAuth and application data through Neon Postgres on Vercel.

**Architecture:** Auth.js owns OAuth and sessions through Drizzle-backed auth tables. Application data stays in Postgres tables equivalent to the current Supabase public schema, accessed only from server-side database helpers and API routes. Client components call app routes or server helpers; they no longer import Supabase or use Supabase Realtime.

**Tech Stack:** Next.js `16.3.2`, React `19.2.8`, Auth.js/NextAuth v5, Drizzle ORM, `@auth/drizzle-adapter`, `@neondatabase/serverless`, Neon Postgres via Vercel Marketplace, TypeScript.

**Spec:** `docs/superpowers/plans/2026-08-22-supabase-to-authjs-neon-spec.md`

## Global Constraints

- Read relevant docs under `node_modules/next/dist/docs/` before modifying Next.js App Router, auth, middleware, or route-handler code.
- Do not use deprecated `@vercel/postgres` for new database work.
- Keep existing app data where practical by preserving UUID primary keys during import.
- Existing Supabase sessions are not preserved; users sign in again with Google.
- Replace Supabase Realtime with polling in this migration.
- Enforce authorization in server code because Supabase RLS and `auth.uid()` will be removed.
- Keep edits scoped to the migration; do not redesign the product UI.

---

## File Structure

- Create `auth.ts`: central Auth.js configuration, Google provider, Drizzle adapter, session callbacks.
- Create `app/api/auth/[...nextauth]/route.ts`: Auth.js route handlers.
- Create `middleware.ts`: optional route protection using Auth.js middleware.
- Create `lib/db/schema.ts`: Drizzle schema for Auth.js and app tables.
- Create `lib/db/index.ts`: Neon/Drizzle database client.
- Create `lib/db/auth-schema.ts` only if keeping Auth.js tables separate makes the schema file too large; otherwise keep all schema in `lib/db/schema.ts`.
- Create `lib/auth/session.ts`: small helpers for current user/session and required user assertions.
- Create `lib/data/users.ts`: profile and social-link reads/writes.
- Create `lib/data/connections.ts`: connection, block, and network graph logic.
- Create `lib/data/itineraries.ts`: itinerary, traveler, segment, task, comment, and invitation logic.
- Create `lib/data/matches.ts`: match and chat logic.
- Create `lib/data/authorization.ts`: shared access checks formerly expressed as Supabase RLS.
- Create `drizzle.config.ts`: migration configuration.
- Create `scripts/migrate-supabase-to-neon.ts`: export/import data migration runner.
- Create `scripts/verify-neon-data.ts`: row-count and foreign-key integrity verification.
- Modify `package.json`: dependencies and scripts.
- Modify `components/AuthForm.tsx`: use Auth.js sign-in instead of Supabase OAuth.
- Modify `app/page.tsx` and `app/profile/setup/page.tsx`: use Auth.js session and new data helpers.
- Modify all `app/api/**/route.ts` files that import `@supabase/supabase-js`: replace Supabase admin clients and token parsing.
- Modify client components importing `@/lib/supabase/queries`: move direct database calls behind API routes or server wrappers.
- Delete after migration is complete: `lib/supabase/client.ts`, `lib/supabase/queries.ts`, `types/supabase.ts`, and Supabase-only SQL files if their content has been converted to Drizzle migrations.

---

### Task 1: Dependency and Documentation Setup

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `drizzle.config.ts`
- Create: `.env.example` if absent

**Interfaces:**
- Produces: `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:studio`, `pnpm migrate:supabase`, and `pnpm verify:data`
- Produces env contract: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, optional `SUPABASE_DB_URL`

- [ ] **Step 1: Read local Next.js guidance**

Run:

```bash
ls node_modules/next/dist/docs
```

Then read the route-handler and middleware/auth-adjacent docs available in that folder. Also keep `AGENTS.md` open while editing.

- [ ] **Step 2: Install migration dependencies**

Run:

```bash
pnpm add next-auth@beta @auth/drizzle-adapter drizzle-orm @neondatabase/serverless
pnpm add -D drizzle-kit tsx vitest @types/pg
```

Expected: `package.json` and `pnpm-lock.yaml` update without removing existing dependencies.

- [ ] **Step 3: Add database scripts**

Modify `package.json` scripts to include:

```json
{
  "db:generate": "drizzle-kit generate",
  "db:migrate": "tsx scripts/run-drizzle-migrations.ts",
  "db:studio": "drizzle-kit studio",
  "migrate:supabase": "tsx scripts/migrate-supabase-to-neon.ts",
  "verify:data": "tsx scripts/verify-neon-data.ts",
  "test": "vitest run"
}
```

If a `test` script already exists by the time this task runs, preserve it and add a `test:unit` script instead.

- [ ] **Step 4: Create Drizzle config**

Create `drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

- [ ] **Step 5: Document environment variables**

Create or update `.env.example`:

```bash
DATABASE_URL=
AUTH_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
SUPABASE_DB_URL=
NEXT_PUBLIC_DEV_MODE=false
OPENAI_API_KEY=
OPENROUTER_API_KEY=
AMADEUS_CLIENT_ID=
AMADEUS_CLIENT_SECRET=
```

- [ ] **Step 6: Verify setup**

Run:

```bash
pnpm lint
pnpm test
```

Expected: either both pass, or failures are unrelated existing issues and are recorded in the task handoff.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml drizzle.config.ts .env.example
git commit -m "chore: add auth and postgres migration tooling"
```

---

### Task 2: Drizzle Schema and Migrations

**Files:**
- Create: `lib/db/schema.ts`
- Create: `lib/db/index.ts`
- Create: `scripts/run-drizzle-migrations.ts`
- Test: `lib/db/schema.test.ts`

**Interfaces:**
- Produces: `db` from `lib/db/index.ts`
- Produces tables: `users`, `accounts`, `sessions`, `verificationTokens`, `profiles`, `socialLinks`, `connections`, `blockedUsers`, `itineraries`, `itineraryTravelers`, `itinerarySegments`, `itineraryTasks`, `itineraryComments`, `itineraryOwnerInvitations`, `matches`, `matchChats`

- [ ] **Step 1: Write schema export test**

Create `lib/db/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import * as schema from "./schema";

describe("database schema", () => {
  it("exports Auth.js and application tables", () => {
    expect(schema.users).toBeDefined();
    expect(schema.accounts).toBeDefined();
    expect(schema.sessions).toBeDefined();
    expect(schema.profiles).toBeDefined();
    expect(schema.connections).toBeDefined();
    expect(schema.itineraries).toBeDefined();
    expect(schema.matchChats).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test lib/db/schema.test.ts
```

Expected: FAIL because `lib/db/schema.ts` does not exist.

- [ ] **Step 3: Implement schema**

Create `lib/db/schema.ts` with Drizzle `pgTable` definitions. Use these exact table names to minimize data migration friction:

```ts
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const connectionStatus = pgEnum("connection_status", [
  "pending",
  "accepted",
  "rejected",
]);
export const connectionType = pgEnum("connection_type", ["first", "one_point_five"]);
export const itineraryVisibility = pgEnum("itinerary_visibility", [
  "private",
  "shared",
  "public",
]);
export const itineraryVisibilityDetail = pgEnum("itinerary_visibility_detail", [
  "private",
  "first_connection",
  "one_point_five",
  "public",
]);
export const itineraryStatus = pgEnum("itinerary_status", [
  "planning",
  "confirmed",
  "completed",
  "cancelled",
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("emailVerified", { withTimezone: true }),
  image: text("image"),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => ({
    pk: primaryKey({ columns: [account.provider, account.providerAccountId] }),
  })
);

export const sessions = pgTable("sessions", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: uuid("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationTokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (vt) => ({
    pk: primaryKey({ columns: [vt.identifier, vt.token] }),
  })
);

export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
    username: text("username").notNull().unique(),
    preferredName: text("preferred_name"),
    gender: text("gender"),
    bio: text("bio"),
    profileImageUrl: text("profile_image_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    usernameIdx: index("idx_profiles_username").on(table.username),
  })
);
```

Continue the file by mapping every Supabase public table used in `types/supabase.ts` and `lib/supabase/schema.sql`. Preserve database column names with snake_case and expose camelCase TypeScript properties.

- [ ] **Step 4: Add database client**

Create `lib/db/index.ts`:

```ts
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const sql = neon(process.env.DATABASE_URL);

export const db = drizzle(sql, { schema });
export type DbClient = typeof db;
```

- [ ] **Step 5: Add migration runner**

Create `scripts/run-drizzle-migrations.ts`:

```ts
import { migrate } from "drizzle-orm/neon-http/migrator";
import { db } from "../lib/db";

async function main() {
  await migrate(db, { migrationsFolder: "./drizzle" });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 6: Run schema test**

Run:

```bash
pnpm test lib/db/schema.test.ts
```

Expected: PASS.

- [ ] **Step 7: Generate migrations**

Run:

```bash
pnpm db:generate
```

Expected: SQL files appear under `drizzle/`.

- [ ] **Step 8: Commit**

```bash
git add lib/db/schema.ts lib/db/index.ts lib/db/schema.test.ts scripts/run-drizzle-migrations.ts drizzle
git commit -m "feat: add drizzle postgres schema"
```

---

### Task 3: Auth.js Integration

**Files:**
- Create: `auth.ts`
- Create: `app/api/auth/[...nextauth]/route.ts`
- Create: `lib/auth/session.ts`
- Create: `middleware.ts`
- Modify: `components/AuthForm.tsx`
- Delete after replacement: `app/auth/callback/page.tsx`

**Interfaces:**
- Produces: `auth()`, `signIn()`, `signOut()`, `requireUser()`
- Consumes: `db`, `users`, `accounts`, `sessions`, `verificationTokens`

- [ ] **Step 1: Write session helper test**

Create `lib/auth/session.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getRequiredUserIdFromSession } from "./session";

describe("getRequiredUserIdFromSession", () => {
  it("returns the session user id", () => {
    expect(getRequiredUserIdFromSession({ user: { id: "00000000-0000-4000-8000-000000000001" } })).toBe(
      "00000000-0000-4000-8000-000000000001"
    );
  });

  it("throws when no user id exists", () => {
    expect(() => getRequiredUserIdFromSession(null)).toThrow("Authentication required");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test lib/auth/session.test.ts
```

Expected: FAIL because `lib/auth/session.ts` does not exist.

- [ ] **Step 3: Create Auth.js config**

Create `auth.ts`:

```ts
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: schema.users,
    accountsTable: schema.accounts,
    sessionsTable: schema.sessions,
    verificationTokensTable: schema.verificationTokens,
  }),
  providers: [
    Google({
      authorization: {
        params: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  session: { strategy: "database" },
  callbacks: {
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
});
```

Add `types/next-auth.d.ts` if TypeScript needs session user ID augmentation:

```ts
import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
```

- [ ] **Step 4: Create Auth.js route**

Create `app/api/auth/[...nextauth]/route.ts`:

```ts
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
```

- [ ] **Step 5: Create session helper**

Create `lib/auth/session.ts`:

```ts
import { auth } from "@/auth";

type MinimalSession = { user?: { id?: string | null } } | null;

export function getRequiredUserIdFromSession(session: MinimalSession): string {
  const userId = session?.user?.id;
  if (!userId) {
    throw new Error("Authentication required");
  }
  return userId;
}

export async function requireUser() {
  const session = await auth();
  return {
    session,
    userId: getRequiredUserIdFromSession(session),
  };
}
```

- [ ] **Step 6: Update sign-in UI**

Modify `components/AuthForm.tsx` to remove `supabase` import and call:

```ts
import { signIn } from "next-auth/react";

await signIn("google", { callbackUrl: "/" });
```

Keep the current button layout and loading/error behavior.

- [ ] **Step 7: Add middleware**

Create `middleware.ts`:

```ts
export { auth as middleware } from "@/auth";

export const config = {
  matcher: ["/profile/:path*", "/api/:path*"],
};
```

If this blocks public API routes such as autofill, narrow the matcher during Task 7.

- [ ] **Step 8: Run auth tests and type checks**

Run:

```bash
pnpm test lib/auth/session.test.ts
pnpm lint
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add auth.ts app/api/auth lib/auth middleware.ts components/AuthForm.tsx types/next-auth.d.ts app/auth/callback/page.tsx
git commit -m "feat: replace supabase auth with authjs"
```

---

### Task 4: User Profile Data Layer

**Files:**
- Create: `lib/data/users.ts`
- Test: `lib/data/users.test.ts`
- Modify: `app/page.tsx`
- Modify: `app/profile/setup/page.tsx`
- Modify: `components/ProfileSetup.tsx`
- Modify: `components/UserProfileSidePanel.tsx`

**Interfaces:**
- Produces: `getProfile(userId: string)`, `upsertProfile(input)`, `getProfileWithLinks(userId: string)`, `listVisibleProfiles(viewerId: string)`
- Consumes: `db`, `profiles`, `users`, `socialLinks`

- [ ] **Step 1: Write profile mapper test**

Create `lib/data/users.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { toPublicProfile } from "./users";

describe("toPublicProfile", () => {
  it("combines Auth.js user and app profile fields", () => {
    expect(
      toPublicProfile({
        id: "00000000-0000-4000-8000-000000000001",
        email: "a@example.com",
        name: "Ada Lovelace",
        image: "https://example.com/a.png",
        username: "ada",
        preferredName: "Ada",
        bio: "Builder",
        profileImageUrl: null,
      })
    ).toEqual({
      id: "00000000-0000-4000-8000-000000000001",
      email: "a@example.com",
      name: "Ada Lovelace",
      username: "ada",
      preferred_name: "Ada",
      bio: "Builder",
      profile_image_url: "https://example.com/a.png",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test lib/data/users.test.ts
```

Expected: FAIL because `lib/data/users.ts` does not exist.

- [ ] **Step 3: Implement user data helpers**

Create `lib/data/users.ts` with:

```ts
import { and, eq, ilike, ne, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles, socialLinks, users } from "@/lib/db/schema";

export type PublicProfile = {
  id: string;
  email: string;
  name: string | null;
  username: string;
  preferred_name: string | null;
  bio: string | null;
  profile_image_url: string | null;
};

export function toPublicProfile(row: {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  username: string;
  preferredName: string | null;
  bio: string | null;
  profileImageUrl: string | null;
}): PublicProfile {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    username: row.username,
    preferred_name: row.preferredName,
    bio: row.bio,
    profile_image_url: row.profileImageUrl ?? row.image,
  };
}

export async function getProfile(userId: string): Promise<PublicProfile | null> {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      image: users.image,
      username: profiles.username,
      preferredName: profiles.preferredName,
      bio: profiles.bio,
      profileImageUrl: profiles.profileImageUrl,
    })
    .from(users)
    .innerJoin(profiles, eq(users.id, profiles.id))
    .where(eq(users.id, userId))
    .limit(1);

  return rows[0] ? toPublicProfile(rows[0]) : null;
}
```

Add `upsertProfile`, `getProfileWithLinks`, and `searchProfiles` in the same file. Every write must receive the authenticated `userId` from `requireUser()`, not from request body trust alone.

- [ ] **Step 4: Update home/profile pages**

Modify `app/page.tsx` so it uses Auth.js session state. If keeping it as a client component, add a small API route for `/api/me`; otherwise convert it to a server component and render the existing dashboard shell.

Modify `app/profile/setup/page.tsx` and `components/ProfileSetup.tsx` to call the new profile helpers/API route.

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm test lib/data/users.test.ts
pnpm lint
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/data/users.ts lib/data/users.test.ts app/page.tsx app/profile/setup/page.tsx components/ProfileSetup.tsx components/UserProfileSidePanel.tsx
git commit -m "feat: move profiles to postgres data layer"
```

---

### Task 5: Authorization Helpers

**Files:**
- Create: `lib/data/authorization.ts`
- Test: `lib/data/authorization.test.ts`

**Interfaces:**
- Produces: `assertCanViewProfile(viewerId, targetId)`, `assertCanManageProfile(viewerId, targetId)`, `assertCanAccessItinerary(userId, itineraryId)`, `assertCanManageItinerary(userId, itineraryId)`, `assertCanUseMatch(userId, matchId)`

- [ ] **Step 1: Write pure authorization tests**

Create `lib/data/authorization.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { canViewUnblockedProfile, canManageOwnResource } from "./authorization";

describe("authorization primitives", () => {
  it("allows users to manage their own resource", () => {
    expect(canManageOwnResource("u1", "u1")).toBe(true);
    expect(canManageOwnResource("u1", "u2")).toBe(false);
  });

  it("blocks profile viewing when either side has blocked the other", () => {
    expect(canViewUnblockedProfile(false)).toBe(true);
    expect(canViewUnblockedProfile(true)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test lib/data/authorization.test.ts
```

Expected: FAIL because helper does not exist.

- [ ] **Step 3: Implement authorization helpers**

Create `lib/data/authorization.ts`:

```ts
import { and, eq, or } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  blockedUsers,
  itineraries,
  itineraryTravelers,
  matches,
} from "@/lib/db/schema";

export function canManageOwnResource(viewerId: string, ownerId: string): boolean {
  return viewerId === ownerId;
}

export function canViewUnblockedProfile(hasBlockBetweenUsers: boolean): boolean {
  return !hasBlockBetweenUsers;
}

export async function hasBlockBetweenUsers(leftUserId: string, rightUserId: string): Promise<boolean> {
  const rows = await db
    .select({ id: blockedUsers.id })
    .from(blockedUsers)
    .where(
      or(
        and(eq(blockedUsers.blockerId, leftUserId), eq(blockedUsers.blockedId, rightUserId)),
        and(eq(blockedUsers.blockerId, rightUserId), eq(blockedUsers.blockedId, leftUserId))
      )
    )
    .limit(1);

  return rows.length > 0;
}
```

Add itinerary and match assertions. Each assertion must throw `new Error("Forbidden")` on denied access.

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm test lib/data/authorization.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/data/authorization.ts lib/data/authorization.test.ts
git commit -m "feat: add server authorization helpers"
```

---

### Task 6: Connections, Blocks, Search, and Network Graph

**Files:**
- Create: `lib/data/connections.ts`
- Test: `lib/data/connections.test.ts`
- Modify: `app/api/block/route.ts`
- Modify: `app/api/search/route.ts`
- Modify: `app/api/users-all/route.ts`
- Modify: `app/api/profile/[id]/route.ts`
- Modify: `app/api/connection/route.ts`
- Modify: `app/api/connections/accepted/route.ts`
- Modify: `app/api/connections/counter/route.ts`
- Modify: `app/api/connections/upgrade/request/route.ts`
- Modify: `components/ConnectionManager.tsx`
- Modify: `components/NetworkGraph.tsx`
- Modify: `components/NetworkGraph.clean.tsx`

**Interfaces:**
- Produces: `createConnectionRequest`, `acceptConnection`, `rejectConnection`, `blockUser`, `unblockUser`, `getAcceptedConnections`, `getConnectionDistance`, `getNetworkGraph`
- Consumes: `requireUser()`, `authorization.ts`

- [ ] **Step 1: Write graph distance test**

Create `lib/data/connections.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { calculateConnectionDistanceInMemory } from "./connections";

describe("calculateConnectionDistanceInMemory", () => {
  it("returns shortest accepted path length", () => {
    expect(
      calculateConnectionDistanceInMemory("a", "d", [
        ["a", "b"],
        ["b", "c"],
        ["c", "d"],
        ["a", "x"],
      ])
    ).toBe(3);
  });

  it("returns -1 when no path exists", () => {
    expect(calculateConnectionDistanceInMemory("a", "z", [["a", "b"]])).toBe(-1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test lib/data/connections.test.ts
```

Expected: FAIL because helper does not exist.

- [ ] **Step 3: Implement connection helpers**

Create `lib/data/connections.ts` and move the shortest-path logic out of Supabase RPC into TypeScript:

```ts
export function calculateConnectionDistanceInMemory(
  fromUserId: string,
  toUserId: string,
  acceptedEdges: Array<[string, string]>
): number {
  if (fromUserId === toUserId) return 0;

  const graph = new Map<string, Set<string>>();
  for (const [left, right] of acceptedEdges) {
    if (!graph.has(left)) graph.set(left, new Set());
    if (!graph.has(right)) graph.set(right, new Set());
    graph.get(left)!.add(right);
    graph.get(right)!.add(left);
  }

  const queue: Array<[string, number]> = [[fromUserId, 0]];
  const visited = new Set<string>([fromUserId]);

  while (queue.length > 0) {
    const [current, distance] = queue.shift()!;
    for (const next of graph.get(current) ?? []) {
      if (next === toUserId) return distance + 1;
      if (!visited.has(next)) {
        visited.add(next);
        queue.push([next, distance + 1]);
      }
    }
  }

  return -1;
}
```

Add database-backed functions that select from `connections` and filter out blocked pairs.

- [ ] **Step 4: Rewrite social API routes**

For each listed route, remove:

```ts
import { createClient } from "@supabase/supabase-js";
```

Replace request identity parsing with:

```ts
import { requireUser } from "@/lib/auth/session";

const { userId } = await requireUser();
```

When a route currently accepts `user_id` from query/body, only use it as a target ID. The acting user must come from the session.

- [ ] **Step 5: Update components**

Replace imports from `@/lib/supabase/queries` with calls to the rewritten API routes or new data helpers. Keep component props stable unless TypeScript forces a narrow change.

- [ ] **Step 6: Run tests and search for Supabase**

Run:

```bash
pnpm test lib/data/connections.test.ts
pnpm lint
rg -n "supabase|@supabase|calculate_connection_distance" app components lib types
```

Expected: tests and lint pass. Remaining Supabase hits should only be in files scheduled for later tasks.

- [ ] **Step 7: Commit**

```bash
git add lib/data/connections.ts lib/data/connections.test.ts app/api/block app/api/search app/api/users-all app/api/profile app/api/connection app/api/connections components/ConnectionManager.tsx components/NetworkGraph.tsx components/NetworkGraph.clean.tsx
git commit -m "feat: move social graph data off supabase"
```

---

### Task 7: Itineraries, Segments, Tasks, Comments, and Invitations

**Files:**
- Create: `lib/data/itineraries.ts`
- Test: `lib/data/itineraries.test.ts`
- Modify: `app/api/itineraries/route.ts`
- Modify: `app/api/itineraries/[id]/route.ts`
- Modify: `app/api/itineraries/[id]/segments/route.ts`
- Modify: `app/api/itineraries/[id]/segments/[segmentId]/route.ts`
- Modify: `app/api/itineraries/[id]/segments/[segmentId]/checklist/route.ts`
- Modify: `app/api/itineraries/[id]/segments/[segmentId]/checklist/[itemId]/route.ts`
- Modify: `app/api/itineraries/[id]/comments/route.ts`
- Modify: `app/api/itineraries/[id]/comments/[commentId]/route.ts`
- Modify: `app/api/itineraries/[id]/owner-invitations/route.ts`
- Modify: `app/api/itineraries/[id]/chat/route.ts`
- Modify: `components/ItineraryPlanner.tsx`
- Modify: `components/ItineraryTimeline.tsx`
- Modify: `components/AddFlightModal.tsx`
- Modify: `components/AddRideModal.tsx`
- Modify: `components/AddStayModal.tsx`

**Interfaces:**
- Produces: `listItinerariesForUser`, `createItinerary`, `updateItinerary`, `deleteItinerary`, `listSegments`, `createSegment`, `updateSegment`, `deleteSegment`, `listTasks`, `createTask`, `updateTask`, `deleteTask`, `listComments`, `createComment`, `updateComment`, `deleteComment`, `inviteOwner`

- [ ] **Step 1: Write itinerary sorting test**

Create `lib/data/itineraries.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sortItinerariesByStartDate } from "./itineraries";

describe("sortItinerariesByStartDate", () => {
  it("sorts dated trips first and undated trips last", () => {
    const rows = [
      { id: "b", start_date: null },
      { id: "c", start_date: "2026-02-01T00:00:00.000Z" },
      { id: "a", start_date: "2026-01-01T00:00:00.000Z" },
    ];

    expect(sortItinerariesByStartDate(rows).map((row) => row.id)).toEqual(["a", "c", "b"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test lib/data/itineraries.test.ts
```

Expected: FAIL because helper does not exist.

- [ ] **Step 3: Implement itinerary data helpers**

Create `lib/data/itineraries.ts`:

```ts
export function sortItinerariesByStartDate<T extends { start_date: string | null }>(rows: T[]): T[] {
  return [...rows].sort((left, right) => {
    const leftTime = left.start_date ? new Date(left.start_date).getTime() : Number.MAX_SAFE_INTEGER;
    const rightTime = right.start_date ? new Date(right.start_date).getTime() : Number.MAX_SAFE_INTEGER;
    return leftTime - rightTime;
  });
}
```

Then port each itinerary route query from Supabase to Drizzle. Keep JSON response shapes identical to the current API responses so components need minimal changes.

- [ ] **Step 4: Replace authorization**

In every itinerary route, replace token/user_id resolution with:

```ts
const { userId } = await requireUser();
```

Before reads or writes, call the matching authorization helper:

```ts
await assertCanAccessItinerary(userId, itineraryId);
await assertCanManageItinerary(userId, itineraryId);
```

- [ ] **Step 5: Preserve autofill behavior**

Keep `app/api/segments/autofill/route.ts` independent from auth unless it currently requires authenticated access. It uses autofill providers, not Supabase, so do not rewrite it for database access.

- [ ] **Step 6: Run tests and Supabase search**

Run:

```bash
pnpm test lib/data/itineraries.test.ts
pnpm lint
rg -n "supabase|@supabase|SUPABASE|auth\\.getUser" app/api/itineraries components lib
```

Expected: no Supabase hits in itinerary routes or itinerary components.

- [ ] **Step 7: Commit**

```bash
git add lib/data/itineraries.ts lib/data/itineraries.test.ts app/api/itineraries components/ItineraryPlanner.tsx components/ItineraryTimeline.tsx components/AddFlightModal.tsx components/AddRideModal.tsx components/AddStayModal.tsx
git commit -m "feat: move itinerary data off supabase"
```

---

### Task 8: Matches, Inbox, Chat, and Realtime Replacement

**Files:**
- Create: `lib/data/matches.ts`
- Test: `lib/data/matches.test.ts`
- Modify: `app/api/match/route.ts`
- Modify: `app/api/match/messages/route.ts`
- Modify: `app/api/match/delete/route.ts`
- Modify: `app/api/inbox/route.ts`
- Modify: `components/MatchMaker.tsx`
- Modify: `components/MatchesList.tsx`
- Modify: `components/Inbox.tsx`
- Modify: `components/Chat.tsx`

**Interfaces:**
- Produces: `createMatch`, `listMatchesForUser`, `deleteMatch`, `listMatchMessages`, `createMatchMessage`, `listInboxItems`
- Replaces Supabase Realtime with `pollMatchMessages(matchId: string, after?: string)`

- [ ] **Step 1: Write polling cursor test**

Create `lib/data/matches.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { filterMessagesAfter } from "./matches";

describe("filterMessagesAfter", () => {
  it("returns all messages when no cursor is supplied", () => {
    const messages = [{ id: "1", created_at: "2026-01-01T00:00:00.000Z" }];
    expect(filterMessagesAfter(messages, null)).toEqual(messages);
  });

  it("returns only messages after the cursor timestamp", () => {
    const messages = [
      { id: "1", created_at: "2026-01-01T00:00:00.000Z" },
      { id: "2", created_at: "2026-01-01T00:00:01.000Z" },
    ];
    expect(filterMessagesAfter(messages, "2026-01-01T00:00:00.000Z")).toEqual([messages[1]]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test lib/data/matches.test.ts
```

Expected: FAIL because helper does not exist.

- [ ] **Step 3: Implement match helpers**

Create `lib/data/matches.ts`:

```ts
export function filterMessagesAfter<T extends { created_at: string }>(
  messages: T[],
  cursor: string | null
): T[] {
  if (!cursor) return messages;
  const cursorTime = new Date(cursor).getTime();
  return messages.filter((message) => new Date(message.created_at).getTime() > cursorTime);
}
```

Port match and inbox queries from Supabase to Drizzle. Replace Supabase RPC `create_match` with a transaction-like sequence: verify accepted connection, check no active duplicate match, insert match, insert initial chat row if needed, return created match.

- [ ] **Step 4: Replace chat realtime**

In `components/Chat.tsx`, remove:

```ts
import { supabase } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
```

Replace the channel subscription with an interval that calls `/api/match/messages?match_id=<id>&after=<lastCreatedAt>` every 3000 ms while the chat is open. Clear the interval on unmount and after match changes.

- [ ] **Step 5: Run tests and Supabase search**

Run:

```bash
pnpm test lib/data/matches.test.ts
pnpm lint
rg -n "RealtimeChannel|postgres_changes|supabase|@supabase" components/Chat.tsx app/api/match app/api/inbox lib/data
```

Expected: no Supabase realtime or Supabase client imports remain in match/chat code.

- [ ] **Step 6: Commit**

```bash
git add lib/data/matches.ts lib/data/matches.test.ts app/api/match app/api/inbox components/MatchMaker.tsx components/MatchesList.tsx components/Inbox.tsx components/Chat.tsx
git commit -m "feat: move matches and chat off supabase"
```

---

### Task 9: Data Migration from Supabase to Neon

**Files:**
- Create: `scripts/migrate-supabase-to-neon.ts`
- Create: `scripts/verify-neon-data.ts`
- Create: `docs/supabase-to-neon-migration.md`

**Interfaces:**
- Consumes: `SUPABASE_DB_URL`, `DATABASE_URL`
- Produces: repeatable migration command and verification report

- [ ] **Step 1: Create migration order**

Create `docs/supabase-to-neon-migration.md` with this table:

```md
# Supabase to Neon Migration Runbook

## Required Environment

- `SUPABASE_DB_URL`: direct read-only Postgres connection string for the existing Supabase database.
- `DATABASE_URL`: Neon Postgres connection string.

## Import Order

1. Supabase `auth.users` into Neon `users`
2. Supabase `public.users` into Neon `profiles`, with `users.name`, `users.email`, and `users.image` patched from Supabase auth metadata where available
3. `social_links`
4. `blocked_users`
5. `connections`
6. `itineraries`
7. `itinerary_travelers`
8. `itinerary_segments`
9. `itinerary_tasks`
10. `itinerary_comments`
11. `itinerary_owner_invitations`
12. `matches`
13. `match_chats`

## Auth Limitation

Existing sessions are not migrated. Users sign in again with Google. Account rows are created by Auth.js on first login. Existing ownership remains stable because imported app data keeps UUID user IDs.
```

- [ ] **Step 2: Implement migration script**

Create `scripts/migrate-supabase-to-neon.ts`. Use `pg` for source and `@neondatabase/serverless` or Drizzle for target. The script must:

```ts
const tableOrder = [
  "users",
  "social_links",
  "blocked_users",
  "connections",
  "itineraries",
  "itinerary_travelers",
  "itinerary_segments",
  "itinerary_tasks",
  "itinerary_comments",
  "itinerary_owner_invitations",
  "matches",
  "match_chats",
] as const;
```

For each table, upsert by primary key and print `{ table, read, written }`. Do not delete target rows.

- [ ] **Step 3: Implement verification script**

Create `scripts/verify-neon-data.ts`. It must compare source and target row counts for every imported table and run orphan checks:

```sql
select count(*) from profiles p left join users u on u.id = p.id where u.id is null;
select count(*) from connections c left join users r on r.id = c.requester_id left join users rc on rc.id = c.recipient_id where r.id is null or rc.id is null;
select count(*) from itineraries i left join users u on u.id = i.owner_id where u.id is null;
```

Exit with code `1` if any orphan count is nonzero or if a target count is lower than source count.

- [ ] **Step 4: Run migration on a disposable Neon branch**

Run:

```bash
pnpm db:migrate
pnpm migrate:supabase
pnpm verify:data
```

Expected: migrations apply, import reports row counts, verification exits `0`.

- [ ] **Step 5: Commit**

```bash
git add scripts/migrate-supabase-to-neon.ts scripts/verify-neon-data.ts docs/supabase-to-neon-migration.md
git commit -m "feat: add supabase to neon data migration"
```

---

### Task 10: Remove Supabase and Final Verification

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Delete: `lib/supabase/client.ts`
- Delete: `lib/supabase/queries.ts`
- Delete: `types/supabase.ts`
- Delete or archive: `lib/supabase/*.sql`, `lib/supabase/migrations/*.sql`
- Modify: `README.md`

**Interfaces:**
- Produces: zero runtime dependency on Supabase

- [ ] **Step 1: Remove Supabase dependency**

Run:

```bash
pnpm remove @supabase/supabase-js
```

- [ ] **Step 2: Remove obsolete files**

Delete files only after `rg` confirms no imports remain:

```bash
rg -n "@/lib/supabase|@supabase|types/supabase|NEXT_PUBLIC_SUPABASE|SUPABASE_" app components lib scripts types
```

Expected before deletion: no code imports. SQL migration references may remain only in docs or archived migration notes.

- [ ] **Step 3: Update README**

Update setup instructions to include:

```md
## Authentication and Database

This app uses Auth.js with Google OAuth and Neon Postgres through Vercel Marketplace.

Required environment variables:

- `DATABASE_URL`
- `AUTH_SECRET`
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`

Local setup:

```bash
pnpm install
pnpm db:migrate
pnpm dev
```
```

- [ ] **Step 4: Run full verification**

Run:

```bash
pnpm lint
pnpm test
pnpm build
rg -n "supabase|@supabase|NEXT_PUBLIC_SUPABASE|SUPABASE_SERVICE_ROLE|auth\\.uid\\(\\)" app components lib scripts types package.json
```

Expected:
- `pnpm lint` passes.
- `pnpm test` passes.
- `pnpm build` passes.
- `rg` returns no runtime Supabase usage.

- [ ] **Step 5: Manual smoke test**

Run:

```bash
pnpm dev
```

Open the local app and verify:
- Google sign-in starts through `/api/auth/signin`.
- Signed-in user with no profile is sent to profile setup.
- Profile setup creates a profile row.
- Dashboard loads for a user with a profile.
- Search, connect, block, itinerary list, segment creation, comments, matches, inbox, and chat message send all work.
- Chat receives new messages after polling without a page refresh.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml README.md app components lib scripts types
git add -u
git commit -m "chore: remove supabase runtime"
```

---

## Self-Review Notes

- Spec coverage: Auth migration, database migration, data preservation, Supabase RLS replacement, and Supabase Realtime replacement are each assigned to specific tasks.
- Placeholder scan: The plan avoids `TBD` and names concrete files, functions, commands, and verification checks. Some schema continuation is intentionally tied to existing `types/supabase.ts` and `lib/supabase/schema.sql` because the table list is finite and present in the repository.
- Type consistency: Session helpers consistently expose `userId: string`; data helpers consume authenticated user IDs from `requireUser()` rather than request-provided actor IDs.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-22-supabase-to-authjs-neon.md`. Two execution options:

1. **Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints.
