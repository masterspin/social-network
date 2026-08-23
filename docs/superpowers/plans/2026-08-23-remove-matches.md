# Remove Matches Plan

## Goal

Remove the match-making feature from the app: no Matches tab, no match chat UI, no match API routes, no match database tables, and no stale mock/type/helper code.

## Data Warning

This migration will delete match data unless it is exported first.

Before dropping tables, export any data the owner wants to keep:

```sql
COPY matches TO STDOUT WITH CSV HEADER;
COPY match_chats TO STDOUT WITH CSV HEADER;
COPY match_messages TO STDOUT WITH CSV HEADER;
```

Drop order must be:

1. `match_messages`
2. `match_chats`
3. `matches`

## Task 1: Remove Dashboard Matches Entry Point

Files:

- `components/Dashboard.tsx`

Steps:

1. Remove `MatchesList` import.
2. Remove `Heart` import if it becomes unused.
3. Change `activeTab` union from `"network" | "inbox" | "profile" | "matches"` to `"network" | "inbox" | "profile"`.
4. Remove the nav item `{ key: "matches", label: "Matches", Icon: Heart }`.
5. Remove the render branch for `activeTab === "matches"`.
6. Re-run typecheck and fix any leftover tab narrowing issues.

## Task 2: Delete Match UI Components

Files to remove:

- `components/MatchesList.tsx`
- `components/MatchMaker.tsx`
- `components/Chat.tsx`

Steps:

1. Confirm no non-match screens import these components.
2. Delete the files.
3. Search for remaining imports by component name.

## Task 3: Delete Match API Routes

Files to remove:

- `app/api/match/route.ts`
- `app/api/match/messages/route.ts`
- `app/api/match/delete/route.ts`

Steps:

1. Delete route files.
2. Search for `/api/match` usage.
3. Remove route tests if any exist.

## Task 4: Remove Match Database Schema

Files:

- `lib/db/schema.ts`
- `drizzle/`

Steps:

1. Remove `matches`, `matchChats`, and `matchMessages` from `lib/db/schema.ts`.
2. Generate a migration named like `0003_remove_matches.sql`.
3. Migration SQL should drop tables in dependency order:

```sql
DROP TABLE IF EXISTS "match_messages";
DROP TABLE IF EXISTS "match_chats";
DROP TABLE IF EXISTS "matches";
```

4. Update Drizzle metadata through the repo's normal migration generation flow, not by hand unless generation is unavailable.
5. Run the migration locally after confirming match data is not needed.

## Task 5: Remove Compatibility Helpers, Mock Data, and Types

Files:

- `lib/supabase/queries.ts`
- `lib/dev/mock-data.ts`
- `types/supabase.ts`

Steps:

1. Remove `getMatches`.
2. Remove `getMatchChats`.
3. Remove `MOCK_MATCHES`.
4. Remove `matches`, `match_chats`, and `match_messages` type sections from `types/supabase.ts`.
5. If `types/supabase.ts` is now only stale Supabase compatibility surface, do a separate cleanup pass rather than mixing that broader removal into this task.

## Task 6: Clean Dead Imports and Copy

Files:

- `components/Dashboard.tsx`
- `README.md`
- `.env.example`
- `package.json`

Steps:

1. Remove unused match-related icons and imports.
2. Search docs for user-facing match instructions and delete stale sections.
3. Do not remove dependencies unless the dependency is only used by the match feature.
4. Confirm no match-specific env vars exist. If none exist, leave env files alone.

## Task 7: Verification

Run these checks:

```bash
rg -n "match|matches|matchmaker|match_chats|match_messages|MatchMaker|MatchesList|/api/match|MOCK_MATCHES|getMatches|getMatchChats" app components lib types README.md .env.example package.json
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run
node node_modules/next/dist/bin/next build
```

Expected search result:

- No live app/API/schema/mock/type hits for removed match feature.
- Historical migration files may still mention match tables in `drizzle/0000_*` and old metadata snapshots. That is acceptable if the new drop migration exists and Drizzle metadata is coherent.

## Implementation Notes

- Keep connection and inbox features intact. Matches currently depend on users and connections, but those base models should stay.
- Do not delete generic chat/message UI unless it is only used by matches. Current `components/Chat.tsx` appears match-specific because it calls `/api/match/messages`.
- The migration is destructive. Export first if match history matters.
