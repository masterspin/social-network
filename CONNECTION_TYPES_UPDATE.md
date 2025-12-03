# Connection Types Update - Implementation Summary

## Changes Made

This update implements a connection type system with 1st and 1.5 connections, with a limit of 100 first connections per user.

### 1. Database Schema Changes

**File: `lib/supabase/add_connection_types.sql`**

- Added `connection_type` column to the `connections` table with CHECK constraint for values: 'first', 'one_point_five'
- Created function `count_first_connections(user_id)` to count accepted first connections for a user
- Created trigger `check_first_connection_limit_trigger` to enforce the 100 first connection limit on INSERT
- Created trigger `check_first_connection_limit_update_trigger` to enforce the limit when accepting connections
- Added indexes for performance: `idx_connections_type` and `idx_connections_requester_type`

**To apply these changes:**
Run the SQL script in your Supabase SQL Editor:

```bash
# Copy the contents of lib/supabase/add_connection_types.sql
# and run it in your Supabase SQL Editor
```

### 2. TypeScript Type Updates

**File: `types/supabase.ts`**

- Added `connection_type: string | null` field to the connections table Row, Insert, and Update types

### 3. API Updates

**File: `app/api/connections/accepted/route.ts`**

- Updated response to include `connection_type` field for each connection

**File: `app/api/connections/counter/route.ts`**

- Updated to preserve `connection_type` when countering connection requests

**File: `lib/supabase/queries.ts`**

- Added new function `getFirstConnectionCount(userId)` to get the count of accepted first connections for a user

### 4. UI Components

**File: `components/UserProfileSidePanel.tsx`**

- Added connection type selector dropdown when sending connection requests
- Shows "1st Connection (Green)" and "1.5 Connection (Purple)" options
- Displays helpful text about the 100 first connection limit
- Shows connection type badge when viewing accepted connections
- Preserves connection type throughout the connection lifecycle

**File: `components/NetworkGraph.tsx`**

- Updated node type definitions to include `connection_type` field
- Modified `getNodeColor()` function to prioritize connection type over distance:
  - Current user: Blue (#3b82f6)
  - 1st connections: Green (#10b981)
  - 1.5 connections: Purple (#a855f7)
  - 2nd degree: Orange (#f59e0b)
  - 3rd degree: Red (#ef4444)
  - Unknown: Gray (#6b7280)
- Updated `expandNodeNeighbors()` to fetch and store connection type information

## Visual Changes

### Graph Display

- **Green nodes**: 1st connections (your closest 100 connections)
- **Purple nodes**: 1.5 connections (important but not in inner circle)
- **Other colors**: Follow the existing distance-based pattern

### Connection Form

When sending a connection request, users now see:

1. **Connection Type** dropdown with two options
2. **Connection Description** field (existing)
3. **Year** field (existing, optional)

### Connection Status Display

Accepted connections now show a small badge indicating if they're "1st" or "1.5" connections.

## Database Constraints

The system enforces the following:

1. Maximum of 100 accepted first connections per user
2. No limit on 1.5 connections
3. Connection type must be either 'first' or 'one_point_five'
4. Limit is checked both when:
   - Creating a new connection request as type 'first'
   - Accepting an incoming 'first' connection request

## Error Handling

If a user tries to create or accept a first connection when they already have 100, the database will return an error:

```
Cannot create more than 100 first connections. User {id} has {count} first connections.
```

This error will be displayed in the UI to inform the user.

## Testing Checklist

After applying the SQL migration, test the following:

1. ✅ Send a connection request with type "1st Connection"
2. ✅ Send a connection request with type "1.5 Connection"
3. ✅ Accept a connection request and verify the type is preserved
4. ✅ View the graph and verify:
   - 1st connections appear as green nodes
   - 1.5 connections appear as purple nodes
5. ✅ Try to create 101st first connection (should fail with error message)
6. ✅ Verify 1.5 connections have no limit
7. ✅ Check that existing connections default to "first" type after migration

## Migration Notes

- All existing connections will be set to 'first' type by default
- If users already have more than 100 connections, they will be grandfathered in but won't be able to create new first connections until they're under the limit
- The limit only applies to **accepted** first connections, pending requests don't count toward the limit
