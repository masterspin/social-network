# Fixing Supabase Relationship Error

## Problem
Error: "Could not find a relationship between 'connections' and 'users' in the schema cache"

Also, the `met_through_id` column was manually removed from the connections table.

## Solution
The foreign key relationships need to be explicitly named for Supabase to recognize them in queries, and all references to `met_through_id` have been removed from the codebase.

## Steps to Fix

### Run this SQL in your Supabase Dashboard → SQL Editor:

```sql
-- Drop existing foreign key constraints if they exist
ALTER TABLE connections DROP CONSTRAINT IF EXISTS connections_requester_id_fkey;
ALTER TABLE connections DROP CONSTRAINT IF EXISTS connections_recipient_id_fkey;

-- Add foreign key constraints with explicit names
ALTER TABLE connections 
  ADD CONSTRAINT connections_requester_id_fkey 
  FOREIGN KEY (requester_id) 
  REFERENCES users(id) 
  ON DELETE CASCADE;

ALTER TABLE connections 
  ADD CONSTRAINT connections_recipient_id_fkey 
  FOREIGN KEY (recipient_id) 
  REFERENCES users(id) 
  ON DELETE CASCADE;

-- Add connection_type column if it doesn't exist (needed for color-coded network graph)
ALTER TABLE connections 
  ADD COLUMN IF NOT EXISTS connection_type TEXT DEFAULT 'first' 
  CHECK (connection_type IN ('first', 'one_point_five'));
```

### Verify the Changes

After running the migration:
1. Go to Table Editor → connections
2. Check the "Foreign Keys" section to verify the constraints are there
3. Check that the `connection_type` column exists
4. Verify that `met_through_id` column is not present

## Files Modified

All references to `met_through_id` have been removed from:
- `lib/supabase/schema.sql` - Updated to use explicit foreign key constraint names, removed met_through_id
- `lib/supabase/queries.ts` - Removed met_through from all queries and types
- `app/api/inbox/route.ts` - Removed met_through from query
- `app/api/connection/route.ts` - Removed met_through from query  
- `components/UserProfileSidePanel.tsx` - Removed met_through type and UI references
- `components/Inbox.tsx` - Removed met_through type
- `components/ConnectionManager.tsx` - Removed met_through type

## Why This Happened

Supabase requires foreign key constraints to have explicit names when using them in queries with the `.select()` syntax like:

```typescript
.select('*, requester:users!connections_requester_id_fkey(...)')
```

The `!connections_requester_id_fkey` part references the constraint name.
