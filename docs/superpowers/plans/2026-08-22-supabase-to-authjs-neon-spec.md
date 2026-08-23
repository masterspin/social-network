# Supabase to Auth.js + Neon Postgres Spec

**User request:** Replace Supabase with Auth.js/NextAuth and Vercel-managed Postgres, preserving existing data where practical.

**Decision:** Use Auth.js v5 (`next-auth`) with Google OAuth, Drizzle ORM, `@auth/drizzle-adapter`, and Neon Postgres through Vercel Marketplace. Do not use deprecated `@vercel/postgres` for new work.

**Data preservation target:** Preserve all application tables from Supabase public schema: profiles, social links, connections, blocked users, itineraries, itinerary travelers, itinerary segments, itinerary tasks, itinerary comments, owner invitations, matches, and match chats. Existing Supabase sessions will not be preserved. Users will sign in again with Google, and the migration should preserve application ownership by keeping existing UUID user IDs where possible.

**Realtime target:** Supabase Realtime must be removed. For this migration, replace realtime chat updates with short-interval polling and keep the interface stable. A later phase can replace polling with SSE or WebSockets.

**Current codebase notes:**
- Next.js version is `16.3.2`; before implementation, read the relevant guide under `node_modules/next/dist/docs/` because local `AGENTS.md` says this Next version may differ from expected APIs.
- Supabase client auth is currently in `components/AuthForm.tsx`, `app/auth/callback/page.tsx`, `app/page.tsx`, and `app/profile/setup/page.tsx`.
- Most application data access is currently centralized in `lib/supabase/queries.ts`, but many API routes create Supabase admin clients directly.
- Supabase RLS policies and `auth.uid()` cannot migrate directly; the server must enforce authorization in application code.

**Primary references checked on 2026-08-22:**
- Vercel Postgres docs: Vercel Postgres is no longer available for new projects; use Marketplace Postgres integrations.
- Vercel Neon Marketplace: Neon is the Vercel-native Postgres path.
- Auth.js installation docs: install `next-auth@beta`, create `auth.ts`, export handlers, `auth`, `signIn`, and `signOut`.
- Auth.js Drizzle adapter docs/package: use `@auth/drizzle-adapter`.
- Neon serverless driver docs: use `@neondatabase/serverless` for serverless Postgres.
- Drizzle Neon docs: use `drizzle-orm/neon-http` with `@neondatabase/serverless`.
