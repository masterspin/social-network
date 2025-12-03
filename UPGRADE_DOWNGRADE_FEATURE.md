# Connection Type Upgrade/Downgrade System

## Overview

This feature allows users to manage their connection types after a connection has been established:

- **Downgrade (1st → 1.5)**: Instant, no approval needed
- **Upgrade (1.5 → 1st)**: Requires approval from the other person

## User Flow

### Downgrading a Connection (1st to 1.5)

1. User views an accepted 1st connection in the profile sidebar
2. Clicks "Downgrade to 1.5 Connection" button
3. Connection type immediately changes to 1.5
4. Graph updates to show purple node instead of green
5. No notification sent to the other person

**Why no approval?** Downgrading reduces the intimacy level, similar to how you can unfollow someone without their permission.

### Upgrading a Connection (1.5 to 1st)

1. **Requester side:**
   - User views an accepted 1.5 connection in the profile sidebar
   - Clicks "Request Upgrade to 1st" button
   - Yellow banner appears showing "Upgrade to 1st connection requested - Waiting for approval..."
   - System checks if requester has space for another 1st connection (limit: 100)
   - If at limit, shows error message

2. **Recipient side:**
   - Views the connection in their profile sidebar
   - Sees yellow banner: "Upgrade request received - Wants to upgrade to 1st connection"
   - Can click "Accept" or "Decline"
   
3. **If accepted:**
   - Connection type changes to 'first' for both users
   - Graph updates to show green node
   - Upgrade request cleared

4. **If declined:**
   - Connection stays as 1.5
   - Upgrade request cleared
   - Requester can request again in the future

## Technical Implementation

### Database Fields

```sql
-- In connections table
connection_type TEXT            -- 'first' or 'one_point_five'
upgrade_requested_type TEXT     -- 'first' when upgrade is pending, NULL otherwise
upgrade_requested_by UUID       -- ID of user who requested the upgrade
```

### API Functions

```typescript
// Request to upgrade from 1.5 to 1st
requestConnectionTypeUpgrade(connectionId, requesterId)

// Instantly downgrade from 1st to 1.5
downgradeConnectionType(connectionId)

// Accept an upgrade request
acceptConnectionTypeUpgrade(connectionId)

// Decline an upgrade request
rejectConnectionTypeUpgrade(connectionId)

// Get pending upgrade requests for a user
getConnectionTypeUpgradeRequests(userId)
```

### Validation Rules

1. **Downgrade:**
   - Must be an accepted connection
   - Must currently be type 'first'
   - Always succeeds (no approval needed)

2. **Upgrade Request:**
   - Must be an accepted connection
   - Must currently be type 'one_point_five'
   - Requester must have fewer than 100 first connections
   - Cannot request if an upgrade is already pending

3. **Accept Upgrade:**
   - Must be the recipient of the upgrade request
   - Recipient must have fewer than 100 first connections
   - Updates connection_type to 'first'
   - Clears upgrade_requested_type and upgrade_requested_by

4. **Decline Upgrade:**
   - Must be the recipient of the upgrade request
   - Keeps connection_type as 'one_point_five'
   - Clears upgrade_requested_type and upgrade_requested_by

## UI Components

### Profile Sidebar - Manage Connection Type Section

Appears below connection details for accepted connections, only if no pending upgrade request:

**For 1st connections:**
```
┌─────────────────────────────────┐
│ Manage Connection Type          │
│                                 │
│ [Downgrade to 1.5 Connection]  │
│ Downgrade does not require      │
│ approval                        │
└─────────────────────────────────┘
```

**For 1.5 connections:**
```
┌─────────────────────────────────┐
│ Manage Connection Type          │
│                                 │
│ [Request Upgrade to 1st]       │
│ Upgrade requires approval from  │
│ the other person                │
└─────────────────────────────────┘
```

### Upgrade Request Banner

**Requester view (yellow banner):**
```
┌─────────────────────────────────┐
│ ⚠ Upgrade to 1st connection    │
│    requested                    │
│    Waiting for approval...      │
└─────────────────────────────────┘
```

**Recipient view (yellow banner with buttons):**
```
┌─────────────────────────────────┐
│ ⚠ Upgrade request received      │
│    Wants to upgrade to 1st      │
│    connection                   │
│                                 │
│    [Accept]    [Decline]       │
└─────────────────────────────────┘
```

## Error Messages

1. **Downgrade fails** (rare, usually a race condition):
   ```
   "Failed to downgrade connection. Please try again."
   ```

2. **Upgrade request when requester at limit:**
   ```
   "Cannot request upgrade to first connection. User {id} has reached 
   the limit of 100 first connections (current: 100)."
   ```

3. **Accept upgrade when recipient at limit:**
   ```
   "Cannot accept connection. User {id} has reached the limit of 100 
   first connections (current: 100)."
   ```

## Future Enhancements

1. **Notification System**: Send notifications when upgrade requests are received/accepted/declined
2. **Upgrade History**: Track history of upgrades/downgrades
3. **Bulk Management**: Allow managing multiple connection types at once
4. **Auto-downgrade**: Automatically downgrade to make room when at limit
5. **Analytics**: Show users their connection type distribution
