# Match Feature

## Overview
The Match feature allows users to play matchmaker by connecting two of their first connections together. When a match is created, both matched users get access to a private chat where they can communicate. Either user can delete the chat at any time, and once deleted, it cannot be recovered.

## Database Schema

### Tables

#### `matches`
Tracks who matched whom together.

```sql
- id: UUID (PK)
- matchmaker_id: UUID (FK -> users)
- user1_id: UUID (FK -> users) 
- user2_id: UUID (FK -> users)
- created_at: TIMESTAMP
```

Constraints:
- `user1_id < user2_id` (ensures consistent ordering)
- Unique pair (user1_id, user2_id)
- All three users must be different

#### `match_chats`
Tracks the chat status for each participant in a match.

```sql
- id: UUID (PK)
- match_id: UUID (FK -> matches)
- user_id: UUID (FK -> users)
- is_active: BOOLEAN (default true)
- deleted_at: TIMESTAMP
- created_at: TIMESTAMP
- updated_at: TIMESTAMP
```

Constraints:
- Unique (match_id, user_id)

#### `match_messages`
Stores chat messages between matched users.

```sql
- id: UUID (PK)
- match_id: UUID (FK -> matches)
- sender_id: UUID (FK -> users)
- message: TEXT (not empty)
- created_at: TIMESTAMP
```

### Database Function

#### `create_match(matchmaker_id, user1_id, user2_id)`
Creates a match and initializes chat rooms for both users atomically.

## API Endpoints

### POST /api/match
Create a new match between two users.

**Request Body:**
```json
{
  "matchmaker_id": "uuid",
  "user1_id": "uuid",
  "user2_id": "uuid"
}
```

**Validation:**
- Both user1 and user2 must be first connections of the matchmaker
- Users cannot already be matched together

**Response:**
```json
{
  "match_id": "uuid"
}
```

### GET /api/match?user_id=xxx
Get all matches for a user.

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "matchmaker": {
        "id": "uuid",
        "username": "string",
        "name": "string",
        "preferred_name": "string",
        "profile_image_url": "string"
      },
      "other_user": {
        "id": "uuid",
        "username": "string",
        "name": "string",
        "preferred_name": "string",
        "profile_image_url": "string"
      },
      "is_active": boolean,
      "deleted_at": "timestamp",
      "created_at": "timestamp"
    }
  ]
}
```

### GET /api/match/messages?match_id=xxx
Get all messages for a match.

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "match_id": "uuid",
      "sender_id": "uuid",
      "message": "string",
      "created_at": "timestamp",
      "sender": {
        "id": "uuid",
        "username": "string",
        "name": "string",
        "preferred_name": "string",
        "profile_image_url": "string"
      }
    }
  ]
}
```

### POST /api/match/messages
Send a message in a match chat.

**Request Body:**
```json
{
  "match_id": "uuid",
  "sender_id": "uuid",
  "message": "string"
}
```

**Validation:**
- Sender must have an active chat for this match

**Response:**
```json
{
  "data": {
    "id": "uuid",
    "match_id": "uuid",
    "sender_id": "uuid",
    "message": "string",
    "created_at": "timestamp"
  }
}
```

### POST /api/match/delete
Delete/leave a match chat.

**Request Body:**
```json
{
  "match_id": "uuid",
  "user_id": "uuid"
}
```

**Response:**
```json
{
  "message": "Chat deleted successfully"
}
```

## Security (RLS Policies)

### matches table
- Users can view matches where they are the matchmaker or one of the matched users
- Only matchmakers can create matches

### match_chats table
- Users can only view and update their own chat status
- System can create chat records

### match_messages table
- Users can view messages in matches where they have an active chat
- Users can send messages only in their active matches

## Workflow

1. **Creating a Match**
   - Matchmaker selects two of their first connections
   - System validates both are first connections
   - System creates match record
   - System creates two match_chat records (one for each user)
   - Both users are notified

2. **Chatting**
   - Users with active chats can send messages
   - Messages are visible to both participants
   - Messages are ordered by creation time

3. **Deleting a Chat**
   - User clicks "Delete Chat"
   - Their match_chat record is set to inactive
   - They can no longer see messages or send new ones
   - The other user's chat remains active (if they haven't deleted it)
   - Once both users delete, the chat is completely inaccessible

## UI Components (To Be Created)

### MatchMaker Component
- Shows list of user's first connections
- Allows selecting two connections
- Button to create match
- Confirmation dialog

### MatchesList Component
- Shows all matches for the current user
- Indicates active vs deleted chats
- Shows who matched them
- Link to open chat

### MatchChat Component
- Chat interface for a specific match
- Shows message history
- Input for sending messages
- Delete button
- Shows if other user has deleted the chat

## Implementation Steps

1. ✅ Database schema created
2. ✅ API endpoints created
3. ⏳ UI components (next step)
4. ⏳ Integration with dashboard
5. ⏳ Real-time updates (optional with Supabase subscriptions)

## Notes

- Matches are permanent records even if both users delete the chat
- Only first connections can be matched (not 1.5 or pending)
- Same pair cannot be matched multiple times
- Chat deletion is per-user and irreversible
- Messages are not deleted when a user leaves the chat
